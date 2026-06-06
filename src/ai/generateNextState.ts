// ============================================================
// AI Runtime — generateNextState (Vercel AI SDK)
// ============================================================

import { buildAUIRSystemPrompt } from "@/auir/prompt";
import { auirResponseSchema } from "@/auir/schema";
import type { AUIRRequest, AUIRResponse } from "@/auir/types";
import { generateObject } from "ai";
import { getModel } from "./model";

/** 使用 Vercel AI SDK generateObject 生成下一版 AUIR 状态 */
export async function generateNextAUIRState(
  request: AUIRRequest
): Promise<AUIRResponse> {
  const model = getModel();

  // DeepSeek JSON Mode 要求：prompt 必须包含 "json" 字样 + 示例格式
  // See: https://api-docs.deepseek.com/zh-cn/guides/json_mode/
  const promptObj = {
    request,
    instruction:
      'You must respond with a single valid json object conforming to the AUIRResponse schema. ' +
      'Output ONLY the json object — no markdown fences, no explanations, no text outside the json. ' +
      'Treat clientSnapshot.localState.values as the latest truth for user inputs.',
  };

  const result = await generateObject({
    model,
    schema: auirResponseSchema,
    system: buildAUIRSystemPrompt(),
    prompt: JSON.stringify(promptObj),
    // 'json' mode → response_format: { type: 'json_object' }
    // Compatible with ALL DeepSeek models including thinking variants
    mode: "json",
    temperature: 0.4,
    maxTokens: 8000,
  });

  return result.object as AUIRResponse;
}
