// ============================================================
// AI Runtime — generateNextState (Vercel AI SDK + Tool Loop)
// ============================================================
// 三阶段架构：
//   Phase 1: 轻量级工具决策（tiny output, 快速可靠）
//   Phase 2: 工具执行
//   Phase 3: 最终 UI 生成（优化 prompt, 增大 maxTokens, 多级错误恢复）
//
// 之前的问题：将工具请求嵌入 AUIRResponse，迭代 2 的 prompt 含完整 previous
// state + tool results，导致 DeepSeek JSON mode 输出失败。
// 新架构将工具决策分离为独立调用，从根本上解决此问题。

import { buildAUIRSystemPrompt } from "@/auir/prompt";
import { auirResponseSchema } from "@/auir/schema";
import type { AUIRRequest, AUIRResponse, UINode } from "@/auir/types";
import { validateOrRetry } from "@/auir/validate";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./model";
import { buildRefinementSupplement, type RefineOutput } from "./refinePrompt";
import { executeTool } from "./tools";

// -----------------------------------------------------------
// Phase 1: 工具决策 Schema + 轻量级调用
// -----------------------------------------------------------

/** 工具决策结果类型 */
interface ToolDecision {
  needsTools: boolean;
  toolRequests?: Array<{
    id: string;
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
  }>;
}

const toolDecisionSchema = z
  .object({
    needsTools: z
      .boolean()
      .describe("Whether external tools are needed before generating UI"),
    toolRequests: z
      .array(
        z.object({
          id: z.string(),
          toolName: z.enum([
            "webSearch",
            "imageSearch",
            "downloadResource",
            "safeCalculator",
            "generateChartData",
            "estimateRocketCycle",
            "summarizeState",
          ]),
          args: z.record(z.string(), z.unknown()),
          reason: z.string(),
        }),
      )
      .optional()
      .describe("Tools to execute (only if needsTools is true)"),
  })
  .passthrough()
  .transform((val) => val as ToolDecision);

/** 轻量级工具决策：判断是否需要联网/下载资源 */
async function decideToolNeeds(request: AUIRRequest): Promise<ToolDecision> {
  const model = getModel("disabled"); // 禁用 thinking 以提高 JSON 可靠性

  const systemPrompt = `You are a tool decision engine. Given a user request, decide if external tools (web search or resource download) are needed BEFORE generating a UI.

AVAILABLE TOOLS:
- webSearch: Search for real-time info. USE when user asks for current/latest/real/live data, news, facts, or any factual information.
- imageSearch: Search for images. USE when user needs visual content (photos, illustrations, diagrams, logos) but doesn't provide a specific URL. Returns direct image URLs.
- downloadResource: Download images from URLs. USE when user explicitly provides an image URL to embed.

DECISION RULES — DEFAULT TO REAL DATA:
- User asks for "current/latest/real/live/today" data → needsTools=true, request webSearch
- User asks for ANY factual information (news, stats, events, people, places) → needsTools=true, request webSearch
- User asks for images/photos/visuals without a specific URL → needsTools=true, request imageSearch
- User asks for "show me photos of X" / "find images of Y" → needsTools=true, request imageSearch
- User provides a specific image URL to download → needsTools=true, request downloadResource
- User asks to show/display/fetch a specific image URL → needsTools=true, request downloadResource
- User asks for demo/example/mock/simulated data EXPLICITLY → needsTools=false
- User asks for general knowledge concepts (e.g., "what is gravity") → needsTools=false
- Ambiguous → needsTools=true, request webSearch (prefer real data over simulation)

IMPORTANT: You may request MULTIPLE tools in a single decision. For example:
- User asks for images of a topic → request imageSearch (no need for webSearch + downloadResource)
- User provides multiple image URLs → request multiple downloadResource calls
Always use the EXACT URL the user provides for downloadResource. Do NOT modify or reconstruct URLs.

Output ONLY valid JSON. No markdown fences, no explanations.`;

  // 从事件中提取关键信息（不发送完整 request）
  const eventSummary = {
    type: request.event.type,
    query:
      request.event.type === "app.search" ? request.event.query : undefined,
    intent:
      request.event.type === "component.click"
        ? request.event.target?.intent
        : undefined,
  };

  try {
    const result = await generateObject({
      model,
      schema: toolDecisionSchema,
      system: systemPrompt,
      prompt: JSON.stringify({
        event: eventSummary,
        instruction:
          "Decide if tools are needed. Output ONLY the JSON decision object.",
      }),
      mode: "json",
      temperature: 0.1,
      maxTokens: 1000,
    });

    return result.object as ToolDecision;
  } catch (err) {
    console.warn(
      "[toolDecision] Failed, assuming no tools needed:",
      (err as Error).message?.slice(0, 100),
    );
    return { needsTools: false };
  }
}

// -----------------------------------------------------------
// Phase 2: 工具执行
// -----------------------------------------------------------

interface ToolExecResult {
  toolRequest: {
    id: string;
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
  };
  result: unknown;
}

async function executeRequestedTools(
  toolRequests: Array<{
    id: string;
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
  }>,
): Promise<ToolExecResult[]> {
  const results: ToolExecResult[] = [];

  for (const tr of toolRequests) {
    try {
      console.log(`[executeTools] Executing: ${tr.toolName} (${tr.id})`);
      const execResult = await executeTool(tr.toolName, tr.args);
      results.push({ toolRequest: tr, result: execResult.result });
      console.log(
        `[executeTools] ${tr.toolName} completed (source: ${execResult.source})`,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[executeTools] ${tr.toolName} failed:`, errMsg);
      results.push({
        toolRequest: tr,
        result: { error: `Tool execution failed: ${errMsg}` },
      });
    }
  }

  return results;
}

// -----------------------------------------------------------
// Phase 3: 工具结果清洗 + UI 生成
// -----------------------------------------------------------

/** 占位符 token */
const IMAGE_PLACEHOLDER = "{{DOWNLOADED_IMAGE_URL}}";

/**
 * 清洗工具结果：将 data URL 替换为占位符，保留元信息。
 * 避免 data URL 膨胀导致模型输出失败。
 */
function sanitizeToolResult(result: unknown, downloadIndex: number): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as Record<string, unknown>;

  // 图片下载结果: 用下载专用索引占位符替换 data URL
  if (
    r.resourceType === "image" &&
    typeof r.data === "string" &&
    r.data.startsWith("data:")
  ) {
    return {
      url: r.url,
      contentType: r.contentType,
      resourceType: r.resourceType,
      byteSize: r.byteSize,
      data: `{{DOWNLOADED_IMAGE_${downloadIndex}}}`,
      status: "success",
      _note: `Image downloaded. Use {{DOWNLOADED_IMAGE_${downloadIndex}}} as src in 'image' nodes. The system replaces it automatically.`,
    };
  }

  // 搜索结果: 截断过长内容
  const json = JSON.stringify(r);
  if (json.length > 2000) {
    try {
      const parsed = JSON.parse(json);
      if (parsed.results && Array.isArray(parsed.results)) {
        parsed.results = parsed.results.slice(0, 3);
      }
      if (parsed.AbstractText && parsed.AbstractText.length > 500) {
        parsed.AbstractText = parsed.AbstractText.slice(0, 500) + "...";
      }
      return parsed;
    } catch {
      return { _truncated: true, _preview: json.slice(0, 500) };
    }
  }

  return r;
}

/** 构建工具结果摘要（注入到 system prompt） */
function buildToolResultsSupplement(toolResults: ToolExecResult[]): string {
  if (toolResults.length === 0) return "";

  // 为 downloadResource 使用独立计数器（避免与非下载工具的索引冲突）
  let downloadIdx = 0;

  const sections = toolResults.map((tr) => {
    const isDownload = tr.toolRequest.toolName === "downloadResource";
    const sanitized = sanitizeToolResult(
      tr.result,
      isDownload ? downloadIdx++ : -1,
    );
    return `--- Tool: ${tr.toolRequest.toolName} (id: ${tr.toolRequest.id}) ---
Reason: ${tr.toolRequest.reason}
Result: ${JSON.stringify(sanitized, null, 1)}`;
  });

  return `

=== TOOL EXECUTION RESULTS (already executed — do NOT request tools again) ===
The following tools have ALREADY been executed with REAL data. You MUST use these results to build the FINAL complete UI now.
Do NOT return a loading/placeholder state. Do NOT include toolRequests in your response.
Generate the COMPLETE, FINAL UI with real data from these results.
${sections.join("\n\n")}
CRITICAL INSTRUCTIONS:
1. For {{DOWNLOADED_IMAGE_N}} placeholders: use them as the "src" field in "image" nodes. The system automatically replaces them with actual data URLs.
2. For image nodes, set src to exactly the placeholder string (e.g., "{{DOWNLOADED_IMAGE_0}}").
3. *** MANDATORY: Set diagnostics.simulatedData = false. The data above is REAL, not simulated. ***
4. *** MANDATORY: Set confidence = "real" on ALL metric/statistic/kpi_card nodes. ***
5. *** FORBIDDEN: Do NOT add alert nodes with titles like "Simulated Data", "模拟数据", "Demo Data", or any disclaimer about data being fake. ***
6. *** FORBIDDEN: Do NOT add text saying "基于模拟数据", "values are simulated", "demo purposes", or similar disclaimers. ***
7. DO NOT output a loading alert or placeholder UI — output the FINAL UI with all tool data integrated.
=== END TOOL RESULTS ===`;
}

/** 从 AUIRRequest 中提取精简上下文（避免发送完整 previous state） */
function buildMinimalRequestSummary(
  request: AUIRRequest,
): Record<string, unknown> {
  return {
    protocol: request.protocol,
    version: request.version,
    session: request.session,
    event: request.event,
    memory: request.memory,
    constraints: {
      allowedComponents: request.constraints.allowedComponents,
      maxNodes: request.constraints.maxNodes,
      maxDepth: request.constraints.maxDepth,
    },
    previousApp: request.previous?.app ?? null,
  };
}

// -----------------------------------------------------------
// 主函数：三阶段架构
// -----------------------------------------------------------

/** 使用 Vercel AI SDK generateObject 生成下一版 AUIR 状态 */
export async function generateNextAUIRState(
  request: AUIRRequest,
  refineResult?: RefineOutput,
  thinking?: boolean,
): Promise<AUIRResponse> {
  const model = getModel(
    thinking === true ? "enabled" : thinking === false ? "disabled" : undefined,
  );

  // ── Phase 1: 工具决策 ──
  console.log("[generateNextState] Phase 1: deciding tool needs...");
  const decision = await decideToolNeeds(request);

  let toolResults: ToolExecResult[] = [];

  // ── Phase 2: 工具执行 ──
  if (
    decision.needsTools &&
    decision.toolRequests &&
    decision.toolRequests.length > 0
  ) {
    console.log(
      `[generateNextState] Phase 2: executing ${decision.toolRequests.length} tool(s):`,
      decision.toolRequests.map((t) => t.toolName).join(", "),
    );
    toolResults = await executeRequestedTools(decision.toolRequests);

    // Phase 2.5: 自动从搜索结果中提取图片 URL 并下载
    // 处理 imageSearch 结果：直接提取 imageUrl
    const imageSearchResults = toolResults.filter(
      (tr) =>
        tr.toolRequest.toolName === "imageSearch" &&
        !(tr.result as Record<string, unknown>)?.error,
    );
    // 处理 webSearch 结果：从 URL 中筛选图片链接
    const webSearchResults = toolResults.filter(
      (tr) =>
        tr.toolRequest.toolName === "webSearch" &&
        !(tr.result as Record<string, unknown>)?.error,
    );
    const existingDownloads = new Set(
      toolResults
        .filter((tr) => tr.toolRequest.toolName === "downloadResource")
        .map((tr) => String((tr.result as Record<string, unknown>)?.url ?? "")),
    );
    const imageUrlsToDownload: string[] = [];

    // 从 imageSearch 结果提取直链（优先，质量最高）
    for (const isr of imageSearchResults) {
      const result = isr.result as Record<string, unknown>;
      const results = result.results as
        | Array<Record<string, unknown>>
        | undefined;
      if (!results) continue;
      for (const r of results) {
        const url = String(r.imageUrl ?? "");
        if (
          url &&
          url.startsWith("http") &&
          !existingDownloads.has(url) &&
          imageUrlsToDownload.length < 5
        ) {
          imageUrlsToDownload.push(url);
          existingDownloads.add(url);
        }
      }
    }

    // 从 webSearch 结果提取图片 URL（补充）
    for (const sr of webSearchResults) {
      const result = sr.result as Record<string, unknown>;
      const results = result.results as
        | Array<Record<string, unknown>>
        | undefined;
      if (!results) continue;
      for (const r of results) {
        const url = String(r.url ?? "");
        if (
          /\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(url) &&
          !existingDownloads.has(url) &&
          imageUrlsToDownload.length < 5
        ) {
          imageUrlsToDownload.push(url);
          existingDownloads.add(url);
        }
      }
    }
    if (imageUrlsToDownload.length > 0) {
      console.log(
        `[generateNextState] Phase 2.5: auto-downloading ${imageUrlsToDownload.length} image(s) from search results`,
      );
      const autoDownloadRequests = imageUrlsToDownload.map((url, i) => ({
        id: `auto_dl_${i}`,
        toolName: "downloadResource" as const,
        args: { url, expectedType: "image" as const },
        reason: "Auto-download image found in webSearch results",
      }));
      const autoResults = await executeRequestedTools(autoDownloadRequests);
      toolResults.push(...autoResults);
    }
  } else {
    console.log("[generateNextState] Phase 2: no tools needed, skipping.");
  }

  // ── Phase 3: UI 生成 ──
  console.log("[generateNextState] Phase 3: generating UI state...");

  // Build system prompt
  let systemPrompt = buildAUIRSystemPrompt();
  if (refineResult) {
    systemPrompt += "\n\n" + buildRefinementSupplement(refineResult);
  }
  // 工具结果注入 system prompt（而非 user prompt）
  if (toolResults.length > 0) {
    systemPrompt += buildToolResultsSupplement(toolResults);
  }

  // Build minimal prompt（不发送完整 previous state）
  const promptObj = buildMinimalRequestSummary(request);
  promptObj.instruction =
    "You must respond with a single valid json object conforming to the AUIRResponse schema. " +
    "Output ONLY the json object — no markdown fences, no explanations. " +
    "Treat clientSnapshot.localState.values as the latest truth for user inputs.";

  if (refineResult) {
    promptObj.refinedSpec = {
      appTitle: refineResult.appTitle,
      appKind: refineResult.appKind,
      appDescription: refineResult.appDescription,
      keyFeatures: refineResult.keyFeatures,
      suggestedLayout: refineResult.suggestedLayout,
      suggestedComponents: refineResult.suggestedComponents,
      refinedPrompt: refineResult.refinedPrompt,
    };
  }

  // 带多级错误恢复的 UI 生成
  const response = await generateWithRetry(
    model,
    systemPrompt,
    promptObj,
    request.constraints,
  );

  // ── Post-process: 替换占位符为实际 data URL ──
  if (response && toolResults.length > 0) {
    postProcessImageUrls(response, toolResults);
    // 强制覆盖: 当有真实工具结果时，标记为真实数据
    forceRealDataMarking(response, toolResults);
  }

  // ── Post-process: 检测并修复 loading/placeholder 页面（无论是否有工具结果）──
  if (response) {
    detectAndFixLoadingPage(response);
  }

  return response;
}

// -----------------------------------------------------------
// 带多级错误恢复的 generateObject 调用
// -----------------------------------------------------------

/** 带多级降级的 UI 生成 */
async function generateWithRetry(
  model: ReturnType<typeof getModel>,
  systemPrompt: string,
  promptObj: Record<string, unknown>,
  constraints?: import("@/auir/types").AUIRConstraints,
): Promise<AUIRResponse> {
  // 尝试 1: 正常生成（maxTokens: 12000）
  try {
    console.log(
      "[generateWithRetry] Attempt 1: full generation (12000 tokens)",
    );
    const response = await validateOrRetry(
      () =>
        generateObject({
          model,
          schema: auirResponseSchema,
          system: systemPrompt,
          prompt: JSON.stringify(promptObj),
          mode: "json",
          temperature: 0.4,
          maxTokens: 12000,
        }).then((r) => r.object),
      constraints,
    );
    return response;
  } catch (err) {
    console.warn(
      "[generateWithRetry] Attempt 1 failed:",
      (err as Error).message?.slice(0, 100),
    );
  }

  // 尝试 2: 截断 system prompt + 降低 temperature
  try {
    console.log(
      "[generateWithRetry] Attempt 2: truncated system prompt (8000 tokens)",
    );
    const shortSystem =
      systemPrompt.length > 4000
        ? systemPrompt.slice(0, 4000) +
          "\n\n[System prompt truncated for reliability]"
        : systemPrompt;

    const response = await validateOrRetry(
      () =>
        generateObject({
          model,
          schema: auirResponseSchema,
          system: shortSystem,
          prompt: JSON.stringify(promptObj),
          mode: "json",
          temperature: 0.3,
          maxTokens: 8000,
        }).then((r) => r.object),
      constraints,
    );
    return response;
  } catch (err) {
    console.warn(
      "[generateWithRetry] Attempt 2 failed:",
      (err as Error).message?.slice(0, 100),
    );
  }

  // 尝试 3: 最小化 prompt，不含工具结果
  try {
    console.log("[generateWithRetry] Attempt 3: minimal prompt (no tools)");
    const minimalSystem = buildAUIRSystemPrompt();
    const minimalPrompt = { ...promptObj };
    delete minimalPrompt.toolResultsContext;
    minimalPrompt.instruction =
      "You must respond with a single valid json object conforming to the AUIRResponse schema. " +
      "Output ONLY the json object. Generate a complete UI based on the event.";

    const response = await validateOrRetry(
      () =>
        generateObject({
          model,
          schema: auirResponseSchema,
          system: minimalSystem,
          prompt: JSON.stringify(minimalPrompt),
          mode: "json",
          temperature: 0.3,
          maxTokens: 8000,
        }).then((r) => r.object),
      constraints,
    );
    return response;
  } catch (err) {
    console.error(
      "[generateWithRetry] All attempts failed:",
      (err as Error).message?.slice(0, 200),
    );
  }

  // 最终降级: 返回基础 UI
  console.error("[generateWithRetry] Falling back to basic UI generation");
  return createBasicFallbackResponse(promptObj);
}

/** 创建基础降级响应 */
function createBasicFallbackResponse(
  promptObj: Record<string, unknown>,
): AUIRResponse {
  const event = promptObj.event as Record<string, unknown> | undefined;
  const query = event?.query as string | undefined;
  const title = query ? `Search: ${query.slice(0, 50)}` : "Generated App";

  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: `app_${Date.now()}`,
        title,
        kind: "utility",
      },
      memory: { app: {}, session: {} },
      ui: {
        id: "fallback_screen",
        type: "screen",
        title,
        children: [
          {
            id: "fallback_heading",
            type: "heading",
            text: title,
            level: 1,
          },
          {
            id: "fallback_alert",
            type: "alert",
            tone: "warning",
            title: "Generation partially failed",
            message:
              "The AI model encountered an issue generating the full UI. " +
              "Try again or simplify your request.",
          },
          {
            id: "fallback_restart",
            type: "button",
            label: "Try Again",
            intent: "restart_runtime",
            variant: "primary",
            interaction: { mode: "ai_transition", commitOn: ["click"] },
          },
        ],
      },
    },
    diagnostics: {
      eventInterpretedAs: query ? `search: ${query}` : "unknown event",
      stateTransition: "fallback generation after model failure",
      simulatedData: true,
      warnings: ["All generation attempts failed, returned basic fallback UI"],
    },
  };
}

// -----------------------------------------------------------
// Post-Processing: 替换占位符为实际 data URL
// -----------------------------------------------------------

function buildDownloadMaps(toolResults: ToolExecResult[]): {
  urlMap: Map<string, string>;
  dataUrls: string[];
  failedUrls: Map<number, string>;
} {
  const urlMap = new Map<string, string>();
  const dataUrls: string[] = [];
  const failedUrls = new Map<number, string>();

  let dlIdx = 0;
  for (const tr of toolResults) {
    if (tr.toolRequest.toolName !== "downloadResource") continue;
    const result = tr.result as Record<string, unknown>;
    const originalUrl = String(result?.url ?? "");

    if (!result || result.error) {
      // 记录失败的下载，保留原始 URL 作为 fallback
      if (originalUrl) {
        failedUrls.set(dlIdx, originalUrl);
        console.warn(
          `[postProcess] Download failed for [${dlIdx}]: ${originalUrl.slice(0, 80)}... error: ${result?.error}`,
        );
      }
      dlIdx++;
      continue;
    }

    const data = String(result.data ?? "");
    const resourceType = String(result.resourceType ?? "");

    if (data.startsWith("data:") && resourceType === "image" && originalUrl) {
      urlMap.set(originalUrl, data);
      dataUrls.push(data);
      console.log(
        `[postProcess] Mapped [${dlIdx}]: ${originalUrl.slice(0, 60)}... → data URL (${data.length} chars)`,
      );
    } else if (originalUrl) {
      failedUrls.set(dlIdx, originalUrl);
      console.warn(
        `[postProcess] Download returned non-image data for [${dlIdx}]: ${originalUrl.slice(0, 80)}...`,
      );
    }
    dlIdx++;
  }

  return { urlMap, dataUrls, failedUrls };
}

function postProcessImageUrls(
  response: AUIRResponse,
  toolResults: ToolExecResult[],
): void {
  const { urlMap, dataUrls, failedUrls } = buildDownloadMaps(toolResults);
  if (urlMap.size === 0 && dataUrls.length === 0 && failedUrls.size === 0)
    return;

  let replaceCount = 0;

  function resolveValue(val: string): string | null {
    // 1. 索引占位符 {{DOWNLOADED_IMAGE_0}}, {{DOWNLOADED_IMAGE_1}}, etc.
    const idxMatch = val.match(/^\{\{DOWNLOADED_IMAGE_(\d+)\}\}$/);
    if (idxMatch) {
      const idx = parseInt(idxMatch[1], 10);
      // 精确匹配 data URL
      if (idx < dataUrls.length) return dataUrls[idx];
      // 越界 fallback: 取最后一个有效 data URL
      if (dataUrls.length > 0) {
        console.warn(
          `[postProcess] Placeholder index ${idx} out of range (have ${dataUrls.length}), falling back to last`,
        );
        return dataUrls[dataUrls.length - 1];
      }
      // 下载失败 fallback: 使用原始 URL（https:// 可直接在浏览器加载）
      const failedUrl = failedUrls.get(idx);
      if (failedUrl && failedUrl.startsWith("https://")) {
        console.warn(
          `[postProcess] Download failed for [${idx}], using original URL as fallback`,
        );
        return failedUrl;
      }
      // 任意 failed URL fallback
      if (failedUrls.size > 0) {
        const firstFailed = failedUrls.values().next().value;
        if (firstFailed && firstFailed.startsWith("https://")) {
          console.warn(
            `[postProcess] Using first failed URL as fallback for placeholder [${idx}]`,
          );
          return firstFailed;
        }
      }
    }
    // 2. 通用占位符
    if (val === IMAGE_PLACEHOLDER && dataUrls.length > 0) {
      return dataUrls[0];
    }
    // 3. 原始 URL 匹配
    const byUrl = urlMap.get(val);
    if (byUrl) return byUrl;
    // 4. 内联占位符
    const inlineMatch = val.match(/\{\{DOWNLOADED_IMAGE_(\d+)\}\}/);
    if (inlineMatch) {
      const idx = parseInt(inlineMatch[1], 10);
      const resolved =
        idx < dataUrls.length
          ? dataUrls[idx]
          : dataUrls.length > 0
            ? dataUrls[dataUrls.length - 1]
            : (failedUrls.get(idx) ?? null);
      if (resolved) return val.replace(inlineMatch[0], resolved);
    }
    return null;
  }

  function walkAndReplace(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    // image.src
    if (obj.type === "image" && typeof obj.src === "string") {
      const r = resolveValue(obj.src);
      if (r) {
        obj.src = r;
        replaceCount++;
      }
    }
    // card.image
    if (obj.type === "card" && typeof obj.image === "string") {
      const r = resolveValue(obj.image);
      if (r) {
        obj.image = r;
        replaceCount++;
      }
    }
    // 任意节点的 src 字段（非 image 类型）
    if (
      typeof obj.src === "string" &&
      obj.type !== "image" &&
      obj.type !== "card"
    ) {
      const r = resolveValue(obj.src);
      if (r) {
        obj.src = r;
        replaceCount++;
      }
    }
    // text 节点: 如果 text 内容是占位符，转换为 image 节点
    if (obj.type === "text" && typeof obj.text === "string") {
      const r = resolveValue(obj.text);
      if (r) {
        obj.type = "image";
        obj.src = r;
        delete obj.text;
        replaceCount++;
        console.log(
          `[postProcess] Converted text node '${obj.id}' → image node with resolved data URL`,
        );
      }
    }

    // 递归遍历所有子节点
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
      `[postProcess] Replaced ${replaceCount} URL(s) with downloaded data URLs`,
    );
  }
}

// -----------------------------------------------------------
// Post-Processing: 强制真实数据标记
// -----------------------------------------------------------

/** 模拟数据相关关键词（中英文） */
const SIMULATED_KEYWORDS = [
  "simulated data",
  "模拟数据",
  "demo data",
  "演示数据",
  "demo purposes",
  "示例数据",
  "mock data",
  "mock 数据",
  "fake data",
  "虚构数据",
  "fabricated",
  "values are simulated",
  "数据为模拟",
  "estimated values",
  "基于模拟",
  "simulated values",
  "all values are simulated",
  "not real",
  "非真实数据",
  "(simulated)",
  "illustrative image",
  "illustrative data",
  "placeholder image",
  "placeholder data",
  "example data",
  "sample data",
  "no results found",
  "no data available",
];

/**
 * 当有真实工具结果时，强制覆盖 AI 输出中的模拟数据标记。
 * 这是最后一道防线——即使 AI 忽略了 prompt 指令，系统也会修正。
 */
function forceRealDataMarking(
  response: AUIRResponse,
  toolResults: ToolExecResult[],
): void {
  // 检查是否有成功的工具结果（非错误）
  const hasRealData = toolResults.some((tr) => {
    const result = tr.result as Record<string, unknown>;
    return result && !result.error;
  });

  if (!hasRealData) return;

  let fixCount = 0;

  // 1. 强制设置 diagnostics.simulatedData = false
  if (response.diagnostics) {
    if (response.diagnostics.simulatedData === true) {
      response.diagnostics.simulatedData = false;
      fixCount++;
      console.log(
        "[forceReal] Overrode diagnostics.simulatedData: true → false",
      );
    }
  }

  // 2. 遍历 UI 树：修正 metric confidence + 移除模拟数据 alert
  function walkAndFix(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    // 修正 metric/statistic/kpi_card 的 confidence
    if (
      (obj.type === "metric" ||
        obj.type === "statistic" ||
        obj.type === "kpi_card") &&
      (obj.confidence === "simulated" || obj.confidence === "estimated")
    ) {
      obj.confidence = "real";
      fixCount++;
      console.log(
        `[forceReal] Fixed confidence on '${obj.id}': simulated/estimated → real`,
      );
    }

    // 移除包含模拟数据关键词的 alert 节点
    if (obj.type === "alert") {
      const title = String(obj.title ?? "").toLowerCase();
      const message = String(obj.message ?? "").toLowerCase();
      const isSimulatedAlert = SIMULATED_KEYWORDS.some(
        (kw) => title.includes(kw) || message.includes(kw),
      );
      if (isSimulatedAlert) {
        // 标记为不可见（而不是删除，避免破坏 children 数组结构）
        obj.visible = false;
        fixCount++;
        console.log(
          `[forceReal] Hidden simulated-data alert: '${obj.id}' (title: "${obj.title}")`,
        );
      }
    }

    // 移除 text 节点中的模拟数据声明
    if (obj.type === "text" && typeof obj.text === "string") {
      const lowerText = obj.text.toLowerCase();
      const isSimulatedText = SIMULATED_KEYWORDS.some((kw) =>
        lowerText.includes(kw),
      );
      if (isSimulatedText) {
        obj.visible = false;
        fixCount++;
        console.log(`[forceReal] Hidden simulated-data text: '${obj.id}'`);
      }
    }

    // 移除 heading 节点中的模拟数据声明
    if (obj.type === "heading" && typeof obj.text === "string") {
      const lowerText = obj.text.toLowerCase();
      const isSimulatedHeading = SIMULATED_KEYWORDS.some((kw) =>
        lowerText.includes(kw),
      );
      if (isSimulatedHeading) {
        obj.visible = false;
        fixCount++;
        console.log(`[forceReal] Hidden simulated-data heading: '${obj.id}'`);
      }
    }

    // 移除包含模拟数据的 description_list 项
    if (obj.type === "description_list" && Array.isArray(obj.items)) {
      for (const item of obj.items as Array<Record<string, unknown>>) {
        const desc = String(item.description ?? "").toLowerCase();
        const term = String(item.term ?? "").toLowerCase();
        if (
          SIMULATED_KEYWORDS.some(
            (kw) => desc.includes(kw) || term.includes(kw),
          )
        ) {
          item._hidden = true;
          fixCount++;
        }
      }
    }

    // 递归遍历
    if (Array.isArray(obj.children)) {
      for (const child of obj.children) walkAndFix(child);
    }
    if (obj.primary) walkAndFix(obj.primary);
    if (obj.secondary) walkAndFix(obj.secondary);
    if (Array.isArray(obj.tabs)) {
      for (const tab of obj.tabs as Array<Record<string, unknown>>) {
        if (Array.isArray(tab.children)) {
          for (const child of tab.children) walkAndFix(child);
        }
      }
    }
    if (Array.isArray(obj.footer)) {
      for (const child of obj.footer) walkAndFix(child);
    }
    if (Array.isArray(obj.items)) {
      for (const item of obj.items as Array<Record<string, unknown>>) {
        if (Array.isArray(item.children)) {
          for (const child of item.children) walkAndFix(child);
        }
      }
    }
  }

  walkAndFix(response.next.ui);

  if (fixCount > 0) {
    console.log(`[forceReal] Applied ${fixCount} real-data correction(s)`);
  }
}

// -----------------------------------------------------------
// Post-Processing: 检测并修复 Loading/Placeholder 页面
// -----------------------------------------------------------

/** Loading 页面相关关键词 */
const LOADING_KEYWORDS = [
  "fetching",
  "loading",
  "正在加载",
  "正在搜索",
  "正在获取",
  "please wait",
  "请稍候",
  "请稍等",
  "searching for",
  "downloading",
  "正在下载",
  "processing request",
  "处理中",
];

/**
 * 检测 AI 是否生成了 loading/placeholder 页面。
 * 如果是，替换为有意义的 fallback UI。
 *
 * 三阶段架构中 Phase 3 是最终调用，不应返回 loading 状态。
 */
function detectAndFixLoadingPage(response: AUIRResponse): void {
  const ui = response.next.ui;
  if (!ui || typeof ui !== "object") return;

  const root = ui as Record<string, unknown>;
  let isLoadingPage = false;

  // 检测方式 1: 根节点是 alert 类型（典型 loading 页面）
  if (root.type === "alert") {
    const title = String(root.title ?? "").toLowerCase();
    const message = String(root.message ?? "").toLowerCase();
    isLoadingPage = LOADING_KEYWORDS.some(
      (kw) => title.includes(kw) || message.includes(kw),
    );
  }

  // 检测方式 2: screen 节点只有 1-2 个子节点且都是 loading 相关
  if (root.type === "screen" && Array.isArray(root.children)) {
    const children = root.children as Array<Record<string, unknown>>;
    if (children.length <= 2) {
      const allLoading = children.every((child) => {
        if (child.type === "alert") {
          const title = String(child.title ?? "").toLowerCase();
          const message = String(child.message ?? "").toLowerCase();
          return LOADING_KEYWORDS.some(
            (kw) => title.includes(kw) || message.includes(kw),
          );
        }
        // heading + alert 组合也是 loading 页
        if (child.type === "heading") return true;
        return false;
      });
      if (allLoading) isLoadingPage = true;
    }
  }

  if (!isLoadingPage) return;

  // Check if timer_refresh already exists in the UI tree
  const hasTimerRefresh = walkFindTimerRefresh(ui);
  if (hasTimerRefresh) {
    console.log(
      "[detectLoading] Loading page has timer_refresh — intentional, allowing auto-refresh",
    );
    return;
  }

  console.warn(
    `[detectLoading] Detected loading/placeholder page WITHOUT timer_refresh, injecting one`,
  );

  // Inject a timer_refresh node as the last child of the screen
  if (root.type === "screen" && Array.isArray(root.children)) {
    (root.children as Record<string, unknown>[]).push({
      id: "auto_refresh_injected",
      type: "timer_refresh",
      seconds: 3,
      message: "正在刷新...",
      showProgress: true,
    });
  } else {
    // If root is not a screen (e.g., an alert), wrap it
    response.next.ui = {
      id: "refresh_screen",
      type: "screen",
      title: "Loading...",
      children: [
        ui as UINode,
        {
          id: "auto_refresh_injected",
          type: "timer_refresh",
          seconds: 3,
          message: "正在刷新...",
          showProgress: true,
        },
      ],
    } as UINode;
  }

  // 更新 diagnostics
  if (response.diagnostics) {
    response.diagnostics.warnings = [
      ...(response.diagnostics.warnings ?? []),
      "AI returned a loading page without timer_refresh — injected auto-refresh timer",
    ];
    response.diagnostics.stateTransition =
      "loading page detected, timer_refresh injected";
  }

  console.log("[detectLoading] Injected timer_refresh into loading page");
}

/** 递归搜索 UI 树中是否存在 timer_refresh 节点 */
function walkFindTimerRefresh(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as Record<string, unknown>;
  if (n.type === "timer_refresh") return true;
  if (Array.isArray(n.children)) {
    for (const child of n.children) {
      if (walkFindTimerRefresh(child)) return true;
    }
  }
  if (n.primary && walkFindTimerRefresh(n.primary)) return true;
  if (n.secondary && walkFindTimerRefresh(n.secondary)) return true;
  if (Array.isArray(n.tabs)) {
    for (const tab of n.tabs) {
      if (
        tab &&
        typeof tab === "object" &&
        Array.isArray((tab as Record<string, unknown>).children)
      ) {
        for (const child of (tab as Record<string, unknown>)
          .children as unknown[]) {
          if (walkFindTimerRefresh(child)) return true;
        }
      }
    }
  }
  return false;
}
