// ============================================================
// AI Runtime — 主入口
// ============================================================

import { beautifyLayout } from "@/auir/beautify";
import { createFallbackResponse, createLauncherState } from "@/auir/fallback";
import type { AUIRRequest, AUIRResponse } from "@/auir/types";
import { validateResponse } from "@/auir/validate";
import { appendRuntimeLog } from "@/runtime/logging/server";
import type { PageLogContext } from "@/runtime/logging/types";
import {
  buildFallbackToolResults,
  forceRealDataMarking,
  generateNextAUIRState,
  postProcessImageUrls,
} from "./generateNextState";
import { mockGenerateNextAUIRState } from "./mockRuntime";
import { isMockMode } from "./model";
import { postProcessUIState } from "./postProcessUI";
import { refineUserQuery, type RefineOutput } from "./refinePrompt";

/** 主 AI Runtime：根据配置选择 Mock 或真实 AI 调用 */
export async function runAIRuntime(
  request: AUIRRequest,
): Promise<AUIRResponse> {
  const pageLogContext = getPageLogContext(request);
  if (isMockMode()) {
    console.log("[AI Runtime] Using Mock mode");
    await appendRuntimeLog({
      type: "runtime.mode.selected",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request.session.sessionId,
      turn: request.session.turn,
      stage: "runtime",
      status: "info",
      payload: { mode: "mock" },
    });
    return mockGenerateNextAUIRState(request);
  }

  // Short-circuit deterministic runtime commands — no AI call needed
  if (request.event.type === "runtime.command") {
    if (
      request.event.command === "restart" ||
      request.event.command === "back_to_launcher"
    ) {
      console.log(
        `[AI Runtime] Short-circuit: ${request.event.command} → launcher state`,
      );
      await appendRuntimeLog({
        type: "runtime.command.short_circuit",
        pageLogId: pageLogContext?.pageLogId,
        sessionId: request.session.sessionId,
        turn: request.session.turn,
        stage: "runtime",
        status: "success",
        payload: { command: request.event.command },
      });
      return {
        protocol: "AUIR",
        version: "0.3",
        next: createLauncherState(),
        diagnostics: {
          eventInterpretedAs: `User requested ${request.event.command}`,
          stateTransition: "any -> launcher",
        },
      };
    }
  }

  console.log("[AI Runtime] Using Vercel AI SDK mode");
  await appendRuntimeLog({
    type: "runtime.mode.selected",
    pageLogId: pageLogContext?.pageLogId,
    sessionId: request.session.sessionId,
    turn: request.session.turn,
    stage: "runtime",
    status: "info",
    payload: { mode: "real" },
  });

  // Check if refine mode is requested (two-step AI pipeline)
  let refineResult: RefineOutput | undefined;
  if (
    request.event.type === "app.search" &&
    request.event.refine &&
    request.event.query.trim()
  ) {
    console.log("[AI Runtime] Refine mode enabled — step 1: refining query...");
    try {
      refineResult = await refineUserQuery(request.event.query, pageLogContext);
      console.log(
        "[AI Runtime] Refine complete:",
        `kind=${refineResult.appKind}, title="${refineResult.appTitle}", features=${refineResult.keyFeatures.length}`,
      );
    } catch (err) {
      console.error(
        "[AI Runtime] Refine step failed, falling back to direct generation:",
        err,
      );
      // Continue without refinement — graceful degradation
      refineResult = undefined;
    }
  }

  // Determine thinking mode from event
  const thinking =
    request.event.type === "app.search" ? request.event.thinking : undefined;
  if (thinking !== undefined) {
    console.log(
      `[AI Runtime] Thinking mode: ${thinking ? "enabled" : "disabled"}`,
    );
  }
  await appendRuntimeLog({
    type: "runtime.options.resolved",
    pageLogId: pageLogContext?.pageLogId,
    sessionId: request.session.sessionId,
    turn: request.session.turn,
    stage: "runtime",
    status: "info",
    payload: {
      refine: Boolean(refineResult),
      thinking,
      eventType: request.event.type,
    },
  });

  // Determine post-process mode from TWO sources:
  //  1. app.search event (user's latest explicit intent — highest priority)
  //  2. session memory (persisted preference from a previous turn)
  const postProcessFromEvent =
    request.event.type === "app.search" ? request.event.postProcess : undefined;
  const postProcessFromMemory = request.memory?.session?.postProcess as
    | boolean
    | undefined;
  // Event overrides memory: user can toggle on/off at any search
  const postProcess = postProcessFromEvent ?? postProcessFromMemory ?? false;

  if (postProcess) {
    console.log(
      "[AI Runtime] Post-Process mode: enabled" +
        (postProcessFromEvent !== undefined
          ? " (from event)"
          : " (from session memory)"),
    );
  }
  await appendRuntimeLog({
    type: "runtime.post_process.resolved",
    pageLogId: pageLogContext?.pageLogId,
    sessionId: request.session.sessionId,
    turn: request.session.turn,
    stage: "runtime",
    status: postProcess ? "success" : "skipped",
    payload: { postProcess, postProcessFromEvent, postProcessFromMemory },
  });

  // Step 2 (or direct): generate AUIR state
  console.log("[AI Runtime] Step 2: generating UI state...");
  try {
    const genResult = await generateNextAUIRState(
      request,
      refineResult,
      thinking,
    );
    let response = genResult.response;
    const toolResults = genResult.toolResults;

    // Validate + beautify (replicates what validateOrRetry did)
    const validationResult = validateResponse(response, request.constraints);
    if (validationResult.ok) {
      response = validationResult.value;
      if (response.next?.ui) {
        beautifyLayout(response.next.ui, {
          defaultDensity: "normal",
          defaultGap: "md",
        });
      }
    } else {
      console.warn(
        "[AI Runtime] Validation failed, using fallback:",
        validationResult.errors.join("; "),
      );
      response = createFallbackResponse(
        `Schema validation failed: ${validationResult.errors.join("; ")}`,
      );
    }
    await appendRuntimeLog({
      type: "runtime.response.validated",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request.session.sessionId,
      turn: request.session.turn,
      stage: "validation",
      status: validationResult.ok ? "success" : "failure",
      payload: validationResult.ok
        ? { app: response.next.app, diagnostics: response.diagnostics }
        : { errors: validationResult.errors, fallback: response },
    });

    // Attach refine/thinking metadata to diagnostics if available
    if (response.diagnostics) {
      const tags: string[] = [];
      if (refineResult) tags.push("refine");
      if (thinking) tags.push("thinking");
      if (tags.length > 0) {
        response.diagnostics.modelUsed =
          (response.diagnostics.modelUsed ?? "") + " + " + tags.join(" + ");
      }

      // Attach framework plan diagnostics when refine provided uiModules
      if (refineResult?.uiModules && refineResult.uiModules.length > 0) {
        const modulesWithTools = refineResult.uiModules.filter(
          (m) =>
            m.searchQueries &&
            (m.searchQueries.web?.length || m.searchQueries.image?.length),
        ).length;
        const totalSearchQueries = refineResult.uiModules.reduce(
          (sum, m) =>
            sum +
            (m.searchQueries?.web?.length ?? 0) +
            (m.searchQueries?.image?.length ?? 0),
          0,
        );
        (response.diagnostics as Record<string, unknown>).frameworkPlan = {
          moduleCount: refineResult.uiModules.length,
          modulesWithTools,
          totalSearchQueries,
          source: "plan-derived",
        };
      }
    }

    // ── Step 3 (optional): Post-Process Mode ──
    // IMPORTANT: Post-process runs on the UI with PLACEHOLDERS (not data URLs).
    // This prevents the second AI from truncating/corrupting large data URLs.
    // Image replacement happens AFTER post-processing (Step 4).
    if (postProcess && response?.next?.ui) {
      console.log(
        "[AI Runtime] Step 3: post-processing UI review (with placeholders)...",
      );
      try {
        const postResult = await postProcessUIState(
          {
            previousUI: request.previous?.ui ?? null,
            newUI: response.next.ui,
            userQuery:
              request.event.type === "app.search"
                ? request.event.query
                : "UI update",
            appTitle: response.next.app?.title,
            appKind: response.next.app?.kind,
          },
          undefined,
          pageLogContext,
        );

        if (postResult.ok) {
          // Validate corrected UI against full AUIR schema before merging.
          // The post-process AI uses generateText (not generateObject with schema),
          // so its output may violate the schema (unsupported components, missing
          // required fields, etc.).
          const originalUI = response.next.ui;
          response.next.ui = postResult.correctedUI;
          const ppValidation = validateResponse(response, request.constraints);
          if (!ppValidation.ok) {
            console.warn(
              "[AI Runtime] Post-process output failed schema validation, reverting:",
              ppValidation.errors.join("; "),
            );
            response.next.ui = originalUI;
            await appendRuntimeLog({
              type: "runtime.post_process.schema_rejected",
              pageLogId: pageLogContext?.pageLogId,
              sessionId: request.session.sessionId,
              turn: request.session.turn,
              stage: "post_process",
              status: "failure",
              payload: { errors: ppValidation.errors },
            });
          } else {
            // Merge corrected UI back
            response = ppValidation.value;
            if (response.next?.ui) {
              beautifyLayout(response.next.ui, {
                defaultDensity: "normal",
                defaultGap: "md",
              });
            }

            // Add post-process diagnostics
            if (response.diagnostics) {
              const ppTag = `postProcess(${postResult.changes.length} fixes)`;
              response.diagnostics.modelUsed =
                (response.diagnostics.modelUsed ?? "") + " + " + ppTag;
              if (postResult.changes.length > 0) {
                response.diagnostics.warnings = [
                  ...(response.diagnostics.warnings ?? []),
                  `Post-process: ${postResult.changes.join("; ")}`,
                ];
              }
            }
            console.log(
              `[AI Runtime] Post-process complete: ${postResult.changes.length} fix(es) applied`,
            );
            await appendRuntimeLog({
              type: "runtime.post_process.applied",
              pageLogId: pageLogContext?.pageLogId,
              sessionId: request.session.sessionId,
              turn: request.session.turn,
              stage: "post_process",
              status: "success",
              payload: { changes: postResult.changes },
            });
          }
        } else {
          console.warn(
            "[AI Runtime] Post-process failed, using original UI:",
            postResult.error,
          );
          // Graceful degradation: use original UI
          await appendRuntimeLog({
            type: "runtime.post_process.failed",
            pageLogId: pageLogContext?.pageLogId,
            sessionId: request.session.sessionId,
            turn: request.session.turn,
            stage: "post_process",
            status: "failure",
            payload: { error: postResult.error },
          });
        }
      } catch (ppErr) {
        console.error(
          "[AI Runtime] Post-process exception, using original UI:",
          (ppErr as Error).message?.slice(0, 200),
        );
        // Graceful degradation: keep original UI
        await appendRuntimeLog({
          type: "runtime.post_process.exception",
          pageLogId: pageLogContext?.pageLogId,
          sessionId: request.session.sessionId,
          turn: request.session.turn,
          stage: "post_process",
          status: "failure",
          payload: {
            error: ppErr instanceof Error ? ppErr.message : String(ppErr),
          },
        });
      }
    }

    // ── Step 4: Image URL replacement (AFTER post-processing) ──
    // Replace placeholders like {{DOWNLOADED_IMAGE_N}} with actual data URLs.
    // This runs after post-processing to prevent the second AI from seeing
    // (and potentially truncating/corrupting) large base64 data URLs.
    //
    // When no tools were executed (e.g. button clicks, navigation), the AI
    // may still emit image placeholders. In that case, we extract data URLs
    // from the PREVIOUS UI tree and use them as fallback replacements.
    if (response) {
      let effectiveToolResults = toolResults;
      let isFallback = false;

      if (toolResults.length === 0) {
        // No fresh tool results — try to salvage images from previous UI
        const fallbackResults = buildFallbackToolResults(request.previous?.ui);
        if (fallbackResults.length > 0) {
          effectiveToolResults = fallbackResults;
          isFallback = true;
          console.log(
            `[AI Runtime] Step 4: using ${fallbackResults.length} data URL(s) from previous UI as fallback`,
          );
        }
      }

      if (effectiveToolResults.length > 0) {
        console.log(
          "[AI Runtime] Step 4: replacing image placeholders with data URLs...",
        );
        postProcessImageUrls(
          response,
          effectiveToolResults,
          isFallback ? undefined : genResult.imageBlueprint,
        );
        if (!isFallback) {
          forceRealDataMarking(response, toolResults);
        }
        await appendRuntimeLog({
          type: "runtime.tool_results.post_processed",
          pageLogId: pageLogContext?.pageLogId,
          sessionId: request.session.sessionId,
          turn: request.session.turn,
          stage: "post_runtime",
          status: "success",
          payload: {
            toolResultCount: effectiveToolResults.length,
            isFallback,
          },
        });
      }
    }

    // ── Persist postProcess preference to session memory ──
    // When the user explicitly sets postProcess on an app.search event,
    // write it into the response's session memory so subsequent turns
    // (button clicks, input commits, tab changes, etc.) inherit the setting.
    if (postProcessFromEvent !== undefined) {
      if (!response.next.memory) {
        response.next.memory = { app: {}, session: {} };
      }
      (response.next.memory.session as Record<string, unknown>).postProcess =
        postProcessFromEvent;
      console.log(
        `[AI Runtime] Persisted postProcess=${postProcessFromEvent} to session memory for future turns`,
      );
    }

    return response;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errName = error instanceof Error ? error.constructor.name : "Unknown";

    // 区分错误类型
    if (errName.includes("API") || errName.includes("Call")) {
      console.error("[AI Runtime] API call error:", errMsg.slice(0, 200));
    } else if (
      errName.includes("Parse") ||
      errName.includes("JSON") ||
      errName.includes("NoObject")
    ) {
      console.error("[AI Runtime] JSON parse error:", errMsg.slice(0, 200));
    } else {
      console.error(
        "[AI Runtime] Unexpected error:",
        errName,
        errMsg.slice(0, 200),
      );
    }

    // Fallback to mock on any error — inject diagnostics so the UI and
    // runtime logs can distinguish a mock fallback from a real AI generation.
    console.log("[AI Runtime] Falling back to Mock mode");
    await appendRuntimeLog({
      type: "runtime.fallback_to_mock",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request.session.sessionId,
      turn: request.session.turn,
      stage: "runtime",
      status: "failure",
      payload: {
        error: errMsg,
        errorName: errName,
      },
    });
    const mockResponse = await mockGenerateNextAUIRState(request);
    if (!mockResponse.diagnostics) {
      mockResponse.diagnostics = {};
    }
    mockResponse.diagnostics.warnings = [
      ...(mockResponse.diagnostics.warnings ?? []),
      `Mock fallback: real AI generation failed (${errName}: ${errMsg.slice(0, 120)})`,
    ];
    mockResponse.diagnostics.simulatedData = true;
    return mockResponse;
  }
}

function getPageLogContext(request: AUIRRequest): PageLogContext | undefined {
  if (!request.session.pageLogId || !request.session.pageStartedAt) {
    return undefined;
  }
  return {
    pageLogId: request.session.pageLogId,
    pageStartedAt: request.session.pageStartedAt,
    sessionId: request.session.sessionId,
    initialQuery: request.session.initialQuery,
  };
}
