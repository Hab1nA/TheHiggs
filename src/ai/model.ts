// ============================================================
// AI Model Provider 配置
// ============================================================

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";

/** 构建注入 thinking 参数的 fetch 包装器 */
function buildThinkingFetch(
  thinkingType: string | null,
): typeof globalThis.fetch {
  const originalFetch = globalThis.fetch;

  return async (input, init) => {
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
}

/** 解析 DEEPSEEK_THINKING 环境变量（全局默认） */
function resolveThinkingMode(): string | null {
  const val = process.env.DEEPSEEK_THINKING?.trim().toLowerCase();
  if (val === "enabled" || val === "true" || val === "1") return "enabled";
  if (val === "disabled" || val === "false" || val === "0") return "disabled";
  if (val === "auto") return "auto";
  return null; // not set → don't inject, let the model decide
}

// -----------------------------------------------------------
// 服务商（Provider）注册表
// 默认来源保持不变；OrcaRouter 作为可选服务商，可通过
//   AI_PROVIDER=orcarouter 或设置 ORCAROUTER_API_KEY 启用。
// OrcaRouter: https://docs.orcarouter.ai/compatibility/frameworks
// -----------------------------------------------------------

/** 支持的模型来源 ID */
export type AIProviderId = "deepseek" | "orcarouter";

export interface AIProviderConfig {
  id: AIProviderId;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

/** OrcaRouter 网关地址（可被 ORCAROUTER_BASE_URL 覆盖） */
export const ORCAROUTER_BASE_URL =
  process.env.ORCAROUTER_BASE_URL ?? "https://api.orcarouter.ai/v1";

/** 解析当前生效的模型来源 */
export function resolveProviderId(): AIProviderId {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === "orcarouter") return "orcarouter";
  if (explicit === "deepseek") return "deepseek";
  // 未显式指定时：配置了 OrcaRouter Key 则自动使用，否则保持默认来源
  if (process.env.ORCAROUTER_API_KEY) return "orcarouter";
  return "deepseek";
}

/** 获取服务商配置 */
export function resolveProviderConfig(): AIProviderConfig {
  if (resolveProviderId() === "orcarouter") {
    return {
      id: "orcarouter",
      name: "OrcaRouter",
      baseUrl: ORCAROUTER_BASE_URL,
      apiKey: process.env.ORCAROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
      defaultModel: "orcarouter/auto",
    };
  }
  return {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com",
    apiKey: process.env.OPENAI_API_KEY ?? "",
    defaultModel: "deepseek-v4-flash-vision-exp",
  };
}

/**
 * 获取当前配置的 AI 模型。
 * @param thinking 按请求覆盖 thinking 模式（仅 DeepSeek 来源生效）：
 *   - "enabled"  启用思维链推理
 *   - "disabled" 禁用思维链（JSON 输出更可靠、更快）
 *   - undefined   使用 DEEPSEEK_THINKING 环境变量（默认）
 */
export function getModel(thinking?: "enabled" | "disabled"): LanguageModelV1 {
  const provider = resolveProviderConfig();
  const modelName = process.env.AI_MODEL ?? provider.defaultModel;

  // Per-request thinking overrides env var — DeepSeek 专属参数，
  // 路由到 OrcaRouter 等其他服务商时不注入
  const thinkingType =
    provider.id === "deepseek" ? (thinking ?? resolveThinkingMode()) : null;

  const customFetch = buildThinkingFetch(thinkingType);

  const client = createOpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl,
    fetch: customFetch,
  });

  // Since we use generateObject with mode: 'json' (which maps to
  // response_format: { type: 'json_object' }), ALL DeepSeek models
  // — including thinking models — support JSON mode.
  // JSON mode does NOT use tool_choice, so thinking mode is compatible.
  // See: https://api-docs.deepseek.com/zh-cn/guides/json_mode/
  return client(modelName);
}

/** 检查当前服务商 API Key 是否已配置 */
export function hasApiKey(): boolean {
  return Boolean(resolveProviderConfig().apiKey);
}

/** 是否使用 Mock 模式 */
export function isMockMode(): boolean {
  return process.env.USE_MOCK_AI === "true" || !hasApiKey();
}

