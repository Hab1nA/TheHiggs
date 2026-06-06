// ============================================================
// AI Model Provider 配置
// ============================================================

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";

/** DeepSeek API 的 OpenAI 兼容 Provider */
function getDeepSeekProvider() {
  const thinkingType = resolveThinkingMode();
  const originalFetch = globalThis.fetch;

  // Inject thinking parameter for DeepSeek models that support it.
  // thinking.type = "enabled" enables chain-of-thought reasoning;
  // thinking.type = "disabled" forces the model to skip the thinking phase,
  // which improves JSON output reliability and response speed.
  // See: https://api-docs.deepseek.com/
  const customFetch: typeof globalThis.fetch = async (input, init) => {
    if (thinkingType && init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        body.thinking = { type: thinkingType };
        init = { ...init, body: JSON.stringify(body) };
      } catch {
        /* body is not JSON, skip injection */
      }
    }
    return originalFetch(input, init);
  };

  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "",
    baseURL: process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com",
    fetch: customFetch,
  });
}

/** 解析 DEEPSEEK_THINKING 环境变量 */
function resolveThinkingMode(): string | null {
  const val = process.env.DEEPSEEK_THINKING?.trim().toLowerCase();
  if (val === "enabled" || val === "true" || val === "1") return "enabled";
  if (val === "disabled" || val === "false" || val === "0") return "disabled";
  if (val === "auto") return "auto";
  return null; // not set → don't inject, let the model decide
}

/** 获取当前配置的 AI 模型 */
export function getModel(): LanguageModelV1 {
  const modelName = process.env.AI_MODEL ?? "deepseek-v4-flash";
  const provider = getDeepSeekProvider();
  // Since we use generateObject with mode: 'json' (which maps to
  // response_format: { type: 'json_object' }), ALL DeepSeek models
  // — including thinking models — support JSON mode.
  // JSON mode does NOT use tool_choice, so thinking mode is compatible.
  // See: https://api-docs.deepseek.com/zh-cn/guides/json_mode/
  return provider(modelName);
}

/** 检查 API Key 是否已配置 */
export function hasApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** 是否使用 Mock 模式 */
export function isMockMode(): boolean {
  return process.env.USE_MOCK_AI === "true" || !hasApiKey();
}
