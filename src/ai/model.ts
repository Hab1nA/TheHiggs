// ============================================================
// AI Model Provider 配置
// ============================================================

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";

/** Agnes 模型常量（Responses API 兼容，上下文 512K / 最大输出 65.5K） */
const AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1";
const AGNES_DEFAULT_MODEL = "agnes-2.5-flash";
/** thinking 始终开启，budget_tokens 打满上限 */
const AGNES_THINKING = { type: "enabled", budget_tokens: 65536 };

/** 构建注入 thinking 参数、并归一化 Responses 响应的 fetch 包装器 */
function buildFetchWrapper(
  thinking: { type: string; budget_tokens?: number } | null,
  normalizeResponsesUsage: boolean,
): typeof globalThis.fetch {
  const originalFetch = globalThis.fetch;

  return async (input, init) => {
    if (thinking && init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        body.thinking = thinking;
        init = { ...init, body: JSON.stringify(body) };
      } catch {
        /* body is not JSON, skip injection */
      }
    }

    const response = await originalFetch(input, init);
    if (!normalizeResponsesUsage || !response.ok) return response;

    // LiteLLM 网关的 /responses 响应把用量写成 prompt_tokens/completion_tokens，
    // 而 OpenAI Responses 规范（及 AI SDK 校验）要求 input_tokens/output_tokens，
    // 在进入 SDK 前补齐这两个字段。
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return response;

    let body: Record<string, unknown>;
    try {
      body = (await response.clone().json()) as Record<string, unknown>;
    } catch {
      return response; // 非 JSON 响应，直接透传
    }

    const usage = body.usage as Record<string, unknown> | undefined;
    if (usage && typeof usage.input_tokens !== "number") {
      const inputTokens = (usage.prompt_tokens as number) ?? 0;
      const outputTokens = (usage.completion_tokens as number) ?? 0;
      body = {
        ...body,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: usage.total_tokens,
          ...usage,
        },
      };
      return new Response(JSON.stringify(body), response);
    }

    return response;
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
export type AIProviderId = "agnes" | "deepseek" | "orcarouter";

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
  if (explicit === "agnes") return "agnes";
  if (explicit === "orcarouter") return "orcarouter";
  if (explicit === "deepseek") return "deepseek";
  // 未显式指定时：配置了 OrcaRouter Key 则自动使用，否则默认 Agnes
  if (process.env.ORCAROUTER_API_KEY) return "orcarouter";
  return "agnes";
}

/** 获取服务商配置 */
export function resolveProviderConfig(): AIProviderConfig {
  if (resolveProviderId() === "agnes") {
    return {
      id: "agnes",
      name: "Agnes AI",
      baseUrl: process.env.OPENAI_BASE_URL ?? AGNES_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY ?? "",
      defaultModel: AGNES_DEFAULT_MODEL,
    };
  }
  if (resolveProviderId() === "orcarouter") {
    return {
      id: "orcarouter",
      name: "OrcaRouter",
      baseUrl: ORCAROUTER_BASE_URL,
      apiKey:
        process.env.ORCAROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
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

  // 各服务商的 thinking 注入内容：
  // - Agnes：始终启用，budget_tokens 打满（Responses API 顶层 thinking 字段）
  // - DeepSeek：按请求参数或 DEEPSEEK_THINKING 环境变量决定，不注入 budget_tokens
  // - OrcaRouter：不注入
  let thinkingBody: { type: string; budget_tokens?: number } | null = null;
  if (provider.id === "agnes") {
    thinkingBody = AGNES_THINKING;
  } else if (provider.id === "deepseek") {
    const t = thinking ?? resolveThinkingMode();
    if (t) thinkingBody = { type: t };
  }

  const client = createOpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl,
    fetch: buildFetchWrapper(thinkingBody, provider.id === "agnes"),
  });

  if (provider.id === "agnes") {
    // Agnes 使用 OpenAI Responses 消息格式（POST /v1/responses）
    return client.responses(modelName);
  }

  // DeepSeek / OrcaRouter 走 chat completions。
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
