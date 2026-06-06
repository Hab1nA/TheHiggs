// ============================================================
// AI Runtime — 主入口
// ============================================================

import type { AUIRRequest, AUIRResponse } from "@/auir/types";
import { validateOrRetry } from "@/auir/validate";
import { generateNextAUIRState } from "./generateNextState";
import { mockGenerateNextAUIRState } from "./mockRuntime";
import { isMockMode } from "./model";

/** 主 AI Runtime：根据配置选择 Mock 或真实 AI 调用 */
export async function runAIRuntime(request: AUIRRequest): Promise<AUIRResponse> {
  if (isMockMode()) {
    console.log("[AI Runtime] Using Mock mode");
    return mockGenerateNextAUIRState(request);
  }

  console.log("[AI Runtime] Using Vercel AI SDK mode");

  // 第一次尝试：generateObject + validateOrRetry（内置 1 次 retry）
  try {
    const response = await validateOrRetry(
      () => generateNextAUIRState(request),
      request.constraints
    );
    return response;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errName = error instanceof Error ? error.constructor.name : "Unknown";

    // 区分错误类型
    if (errName.includes("API") || errName.includes("Call")) {
      console.error("[AI Runtime] API call error:", errMsg.slice(0, 200));
    } else if (errName.includes("Parse") || errName.includes("JSON") || errName.includes("NoObject")) {
      console.error("[AI Runtime] JSON parse error:", errMsg.slice(0, 200));
    } else {
      console.error("[AI Runtime] Unexpected error:", errName, errMsg.slice(0, 200));
    }

    // Fallback to mock on any error
    console.log("[AI Runtime] Falling back to Mock mode");
    return mockGenerateNextAUIRState(request);
  }
}
