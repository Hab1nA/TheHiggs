// ============================================================
// AI Runtime — 主入口
// ============================================================

import type { AUIRRequest, AUIRResponse } from "@/auir/types";
import { validateOrRetry } from "@/auir/validate";
import { generateNextAUIRState } from "./generateNextState";
import { mockGenerateNextAUIRState } from "./mockRuntime";
import { isMockMode } from "./model";
import { postProcessUIState } from "./postProcessUI";
import { refineUserQuery, type RefineOutput } from "./refinePrompt";

/** 主 AI Runtime：根据配置选择 Mock 或真实 AI 调用 */
export async function runAIRuntime(
  request: AUIRRequest,
): Promise<AUIRResponse> {
  if (isMockMode()) {
    console.log("[AI Runtime] Using Mock mode");
    return mockGenerateNextAUIRState(request);
  }

  console.log("[AI Runtime] Using Vercel AI SDK mode");

  // Check if refine mode is requested (two-step AI pipeline)
  let refineResult: RefineOutput | undefined;
  if (
    request.event.type === "app.search" &&
    request.event.refine &&
    request.event.query.trim()
  ) {
    console.log("[AI Runtime] Refine mode enabled — step 1: refining query...");
    try {
      refineResult = await refineUserQuery(request.event.query);
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

  // Step 2 (or direct): generate AUIR state
  console.log("[AI Runtime] Step 2: generating UI state...");
  try {
    const response = await validateOrRetry(
      () => generateNextAUIRState(request, refineResult, thinking),
      request.constraints,
    );

    // Attach refine/thinking metadata to diagnostics if available
    if (response.diagnostics) {
      const tags: string[] = [];
      if (refineResult) tags.push("refine");
      if (thinking) tags.push("thinking");
      if (tags.length > 0) {
        response.diagnostics.modelUsed =
          (response.diagnostics.modelUsed ?? "") + " + " + tags.join(" + ");
      }
    }

    // ── Step 3 (optional): Post-Process Mode ──
    // When enabled, send the generated UI to a second AI for quality review.
    // The reviewer checks: functional consistency, layout aesthetics,
    // and positional stability (same elements stay at same positions).
    if (postProcess && response?.next?.ui) {
      console.log("[AI Runtime] Step 3: post-processing UI review...");
      try {
        const postResult = await postProcessUIState({
          previousUI: request.previous?.ui ?? null,
          newUI: response.next.ui,
          userQuery:
            request.event.type === "app.search"
              ? request.event.query
              : "UI update",
          appTitle: response.next.app?.title,
          appKind: response.next.app?.kind,
        });

        if (postResult.ok) {
          // Merge corrected UI back
          response.next.ui = postResult.correctedUI;

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
        } else {
          console.warn(
            "[AI Runtime] Post-process failed, using original UI:",
            postResult.error,
          );
          // Graceful degradation: use original UI
        }
      } catch (ppErr) {
        console.error(
          "[AI Runtime] Post-process exception, using original UI:",
          (ppErr as Error).message?.slice(0, 200),
        );
        // Graceful degradation: keep original UI
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

    // Fallback to mock on any error
    console.log("[AI Runtime] Falling back to Mock mode");
    return mockGenerateNextAUIRState(request);
  }
}
