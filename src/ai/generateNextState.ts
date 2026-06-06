// ============================================================
// AI Runtime — generateNextState (Vercel AI SDK + Tool Loop)
// ============================================================

import { buildAUIRSystemPrompt } from "@/auir/prompt";
import { auirResponseSchema } from "@/auir/schema";
import type { AUIRRequest, AUIRResponse, AUIRToolRequest } from "@/auir/types";
import { generateObject } from "ai";
import { getModel } from "./model";
import { buildRefinementSupplement, type RefineOutput } from "./refinePrompt";
import { executeTool } from "./tools";

/** 最大 tool loop 迭代次数（防止无限循环） */
const MAX_TOOL_LOOP_ITERATIONS = 3;

/** 使用 Vercel AI SDK generateObject 生成下一版 AUIR 状态，支持 tool calling loop */
export async function generateNextAUIRState(
  request: AUIRRequest,
  refineResult?: RefineOutput,
  thinking?: boolean,
): Promise<AUIRResponse> {
  const model = getModel(
    thinking === true ? "enabled" : thinking === false ? "disabled" : undefined,
  );

  // Build system prompt; append refinement supplement if available
  let systemPrompt = buildAUIRSystemPrompt();
  if (refineResult) {
    systemPrompt += "\n\n" + buildRefinementSupplement(refineResult);
  }

  // Build the base instruction
  const baseInstruction =
    "You must respond with a single valid json object conforming to the AUIRResponse schema. " +
    "Output ONLY the json object — no markdown fences, no explanations, no text outside the json. " +
    "Treat clientSnapshot.localState.values as the latest truth for user inputs.";

  // Tool calling loop: AI may request tools, we execute them, feed results back
  let currentResponse: AUIRResponse | null = null;
  const toolResults: Array<{ toolRequest: AUIRToolRequest; result: unknown }> =
    [];

  for (let iteration = 0; iteration < MAX_TOOL_LOOP_ITERATIONS; iteration++) {
    const promptObj: Record<string, unknown> = buildPromptObject(
      request,
      refineResult,
      baseInstruction,
      currentResponse,
      toolResults,
    );

    console.log(
      `[generateNextState] Tool loop iteration ${iteration + 1}/${MAX_TOOL_LOOP_ITERATIONS}` +
        (toolResults.length > 0
          ? ` (${toolResults.length} tool results injected)`
          : ""),
    );

    const result = await generateObject({
      model,
      schema: auirResponseSchema,
      system: systemPrompt,
      prompt: JSON.stringify(promptObj),
      mode: "json",
      temperature: 0.4,
      maxTokens: 8000,
    });

    currentResponse = result.object as AUIRResponse;

    // Check if the AI requested tools
    const pendingTools = currentResponse.toolRequests;
    if (!pendingTools || pendingTools.length === 0) {
      // No tool requests → we're done
      console.log(
        "[generateNextState] No tool requests — generation complete.",
      );
      break;
    }

    console.log(
      `[generateNextState] AI requested ${pendingTools.length} tool(s):`,
      pendingTools.map((t) => t.toolName).join(", "),
    );

    // Execute all requested tools
    const newResults = await executeRequestedTools(pendingTools);
    toolResults.push(...newResults);

    // If this is the last iteration, warn and break
    if (iteration >= MAX_TOOL_LOOP_ITERATIONS - 1) {
      console.warn(
        "[generateNextState] Max tool loop iterations reached. " +
          "Returning last response with pending tool requests stripped.",
      );
      // Strip pending tool requests to avoid confusion
      delete currentResponse.toolRequests;
      break;
    }
  }

  // Post-process: replace hallucinated image URLs with actual downloaded data URLs
  if (currentResponse && toolResults.length > 0) {
    postProcessImageUrls(currentResponse, toolResults);
  }

  return (
    currentResponse ?? {
      protocol: "AUIR",
      version: "0.3",
      next: {
        app: { id: "error", title: "Generation Error", kind: "unknown" },
        memory: { app: {}, session: {} },
        ui: {
          id: "err",
          type: "alert",
          tone: "danger",
          title: "AI Generation Failed",
          message: "Could not generate a valid response.",
        } as unknown as AUIRResponse["next"]["ui"],
      },
      diagnostics: {
        errors: ["Tool loop exhausted without valid response"],
      },
    }
  );
}

/** 构建每次调用的 prompt object */
function buildPromptObject(
  request: AUIRRequest,
  refineResult: RefineOutput | undefined,
  baseInstruction: string,
  previousResponse: AUIRResponse | null,
  toolResults: Array<{ toolRequest: AUIRToolRequest; result: unknown }>,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    request,
    instruction: baseInstruction,
  };

  if (refineResult) {
    obj.refinedSpec = {
      appTitle: refineResult.appTitle,
      appKind: refineResult.appKind,
      appDescription: refineResult.appDescription,
      keyFeatures: refineResult.keyFeatures,
      suggestedLayout: refineResult.suggestedLayout,
      suggestedComponents: refineResult.suggestedComponents,
      refinedPrompt: refineResult.refinedPrompt,
    };
  }

  // If this is a follow-up call (tool results exist), provide context
  if (toolResults.length > 0) {
    obj.toolResultsContext = {
      message:
        "Below are the results of the tools you requested. " +
        "Use this information to enrich your UI generation. " +
        "Do NOT request the same tools again. " +
        "Produce the FINAL AUIRResponse with the complete UI now.\n\n" +
        "IMPORTANT: For downloadResource results, use the placeholder token " +
        "{{DOWNLOADED_IMAGE_URL}} as the src value in 'image' nodes or " +
        "the image field in 'card' nodes. The system will replace this " +
        "placeholder with the actual image data automatically.",
      executedTools: toolResults.map((tr, idx) => ({
        toolName: tr.toolRequest.toolName,
        reason: tr.toolRequest.reason,
        result: sanitizeToolResultForPrompt(tr.result, idx),
      })),
    };
  }

  // If the previous response had toolRequests but they were executed,
  // tell the AI to proceed to final generation
  if (previousResponse?.toolRequests && toolResults.length > 0) {
    obj.proceedToFinal = true;
  }

  return obj;
}

/** 执行 AI 请求的工具列表 */
async function executeRequestedTools(
  toolRequests: AUIRToolRequest[],
): Promise<Array<{ toolRequest: AUIRToolRequest; result: unknown }>> {
  const results: Array<{ toolRequest: AUIRToolRequest; result: unknown }> = [];

  for (const tr of toolRequests) {
    try {
      console.log(
        `[generateNextState] Executing tool: ${tr.toolName} (${tr.id})`,
      );
      const execResult = await executeTool(tr.toolName, tr.args);
      results.push({ toolRequest: tr, result: execResult.result });
      console.log(
        `[generateNextState] Tool ${tr.toolName} completed (source: ${execResult.source})`,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[generateNextState] Tool ${tr.toolName} failed:`, errMsg);
      results.push({
        toolRequest: tr,
        result: { error: `Tool execution failed: ${errMsg}` },
      });
    }
  }

  return results;
}

/**
 * 清洗工具结果用于 prompt 注入：
 * - downloadResource: 将 data URL 替换为占位符，保留元信息
 * - 其他工具: 原样返回，但截断过长内容
 */
function sanitizeToolResultForPrompt(result: unknown, index?: number): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as Record<string, unknown>;

  // downloadResource 结果: 用占位符替换 data URL
  if (
    r.resourceType === "image" &&
    typeof r.data === "string" &&
    r.data.startsWith("data:")
  ) {
    const placeholder =
      index !== undefined ? `{{DOWNLOADED_IMAGE_${index}}}` : IMAGE_PLACEHOLDER;
    return {
      url: r.url,
      contentType: r.contentType,
      resourceType: r.resourceType,
      byteSize: r.byteSize,
      downloadedAt: r.downloadedAt,
      data: placeholder,
      _instruction: `Use ${placeholder} as the src/image field value. The system replaces it automatically.`,
    };
  }

  // 其他结果: 原样返回，但截断过长的内容
  const json = JSON.stringify(r);
  if (json.length > 3000) {
    return JSON.parse(json.slice(0, 3000) + '"}');
  }
  return r;
}

// -----------------------------------------------------------
// Post-Processing — 用实际下载的 data URL 替换 AI 幻觉的远程 URL
// -----------------------------------------------------------

/**
 * 从 toolResults 中收集所有成功的 downloadResource 结果。
 * 返回两个映射：
 *   - urlMap: 原始URL → data URL（用于替换幻觉 URL）
 *   - dataUrls: 所有成功下载的 data URL 数组（用于替换占位符）
 */
function buildDownloadMaps(
  toolResults: Array<{ toolRequest: AUIRToolRequest; result: unknown }>,
): { urlMap: Map<string, string>; dataUrls: string[] } {
  const urlMap = new Map<string, string>();
  const dataUrls: string[] = [];

  for (const tr of toolResults) {
    if (tr.toolRequest.toolName !== "downloadResource") continue;
    const result = tr.result as Record<string, unknown>;
    if (!result || result.error) continue;

    const originalUrl = String(result.url ?? "");
    const data = String(result.data ?? "");
    const resourceType = String(result.resourceType ?? "");

    if (data.startsWith("data:") && resourceType === "image" && originalUrl) {
      urlMap.set(originalUrl, data);
      dataUrls.push(data);
      console.log(
        `[postProcess] Mapped URL → data URL: ${originalUrl.slice(0, 60)}... (${data.length} chars)`,
      );
    }
  }

  return { urlMap, dataUrls };
}

/** 占位符 token（必须与 sanitizeToolResultForPrompt 中的一致） */
const IMAGE_PLACEHOLDER = "{{DOWNLOADED_IMAGE_URL}}";

/**
 * 后处理：
 * 1. 替换 UI 树中的占位符 {{DOWNLOADED_IMAGE_URL}} → 实际 data URL
 * 2. 替换 AI 幻觉的远程 URL → 实际下载的 data URL
 */
function postProcessImageUrls(
  response: AUIRResponse,
  toolResults: Array<{ toolRequest: AUIRToolRequest; result: unknown }>,
): void {
  const { urlMap, dataUrls } = buildDownloadMaps(toolResults);
  if (urlMap.size === 0 && dataUrls.length === 0) return;

  let replaceCount = 0;
  let placeholderIdx = 0;

  function resolveValue(val: string): string | null {
    // 1. 匹配索引占位符 {{DOWNLOADED_IMAGE_0}}, {{DOWNLOADED_IMAGE_1}}, etc.
    const idxMatch = val.match(/^\{\{DOWNLOADED_IMAGE_(\d+)\}\}$/);
    if (idxMatch) {
      const idx = parseInt(idxMatch[1], 10);
      if (idx < dataUrls.length) return dataUrls[idx];
    }
    // 2. 匹配通用占位符（按顺序分配）
    if (val === IMAGE_PLACEHOLDER && placeholderIdx < dataUrls.length) {
      return dataUrls[placeholderIdx++];
    }
    // 3. 匹配原始 URL
    const byUrl = urlMap.get(val);
    if (byUrl) return byUrl;
    // 4. 匹配包含占位符的字符串
    if (val.includes(IMAGE_PLACEHOLDER) && placeholderIdx < dataUrls.length) {
      return val.replace(IMAGE_PLACEHOLDER, dataUrls[placeholderIdx++]);
    }
    // 5. 匹配包含索引占位符的字符串
    const inlineMatch = val.match(/\{\{DOWNLOADED_IMAGE_(\d+)\}\}/);
    if (inlineMatch) {
      const idx = parseInt(inlineMatch[1], 10);
      if (idx < dataUrls.length) {
        return val.replace(inlineMatch[0], dataUrls[idx]);
      }
    }
    return null;
  }

  function walkAndReplace(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    // 替换 image 节点的 src
    if (obj.type === "image" && typeof obj.src === "string") {
      const replacement = resolveValue(obj.src);
      if (replacement) {
        obj.src = replacement;
        replaceCount++;
      }
    }

    // 替换 card 节点的 image 字段
    if (obj.type === "card" && typeof obj.image === "string") {
      const replacement = resolveValue(obj.image);
      if (replacement) {
        obj.image = replacement;
        replaceCount++;
      }
    }

    // 替换任意节点中 src 为占位符的情况
    if (typeof obj.src === "string" && obj.src !== obj.type) {
      const replacement = resolveValue(obj.src);
      if (replacement) {
        obj.src = replacement;
        replaceCount++;
      }
    }

    // 递归遍历 children
    if (Array.isArray(obj.children)) {
      for (const child of obj.children) walkAndReplace(child);
    }
    if (obj.primary) walkAndReplace(obj.primary);
    if (obj.secondary) walkAndReplace(obj.secondary);
    if (Array.isArray(obj.tabs)) {
      for (const tab of obj.tabs as Array<Record<string, unknown>>) {
        if (Array.isArray(tab.children)) {
          for (const child of tab.children) walkAndReplace(child);
        }
      }
    }
    if (Array.isArray(obj.footer)) {
      for (const child of obj.footer) walkAndReplace(child);
    }
    if (Array.isArray(obj.items)) {
      for (const item of obj.items as Array<Record<string, unknown>>) {
        if (Array.isArray(item.children)) {
          for (const child of item.children) walkAndReplace(child);
        }
      }
    }
  }

  walkAndReplace(response.next.ui);

  if (replaceCount > 0) {
    console.log(
      `[postProcess] Replaced ${replaceCount} URL(s)/placeholder(s) with downloaded data URLs`,
    );
  }
}
