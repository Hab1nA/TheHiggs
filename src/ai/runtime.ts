// ============================================================
// AI Runtime — 主入口
// ============================================================

import type { AUIRRequest, AUIRResponse } from "@/auir/types";
import { validateOrRetry } from "@/auir/validate";
import { generateNextAUIRState } from "./generateNextState";
import { mockGenerateNextAUIRState } from "./mockRuntime";
import { isMockMode } from "./model";
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
