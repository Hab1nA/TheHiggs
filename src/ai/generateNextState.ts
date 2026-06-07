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
import {
  auirResponseSchema,
  imageBlueprintSchema,
  type ImageBlueprint,
} from "@/auir/schema";
import type { AUIRRequest, AUIRResponse, UINode } from "@/auir/types";
import { validateOrRetry } from "@/auir/validate";
import { appendRuntimeLog } from "@/runtime/logging/server";
import type { PageLogContext } from "@/runtime/logging/types";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./model";
import {
  buildRefinementSupplement,
  type RefineOutput,
  type UIModulePlan,
} from "./refinePrompt";
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
    moduleId?: string;
  }>;
  imageBlueprint?: ImageBlueprint;
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
    imageBlueprint: imageBlueprintSchema
      .optional()
      .describe(
        "Planned image slots for the next UI. Provide when visual content is needed.",
      ),
  })
  .passthrough()
  .transform((val) => val as ToolDecision);

/** 轻量级工具决策：判断是否需要联网/下载资源 */
async function decideToolNeeds(request: AUIRRequest): Promise<ToolDecision> {
  const model = getModel("disabled"); // 禁用 thinking 以提高 JSON 可靠性
  const pageLogContext = getPageLogContext(request);

  const systemPrompt = `You are a tool decision engine. Given a user request, decide if external tools are needed BEFORE generating a UI.

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

IMAGE SEARCH STRATEGY (CRITICAL):
- If visual content is needed, do NOT search broadly using only the user prompt.
- Instead, plan the next UI's image slots FIRST, then search per slot.
- Prefer slot-specific queries like hero cover, card thumbnail, section illustration, character portrait, map preview, product photo, etc.
- For each image slot, request up to 3 precise queries and avoid duplicates across slots.

SPECIAL RULES FOR timer.refresh EVENTS:
- timer.refresh means the UI is being auto-refreshed after an initial loading state.
- If the app context (previousApp.title, previousApp.kind, sessionContext) indicates the app is about factual, real-time, or visual data (search results, news, weather, images, stock prices, etc.), you MUST set needsTools=true and request the appropriate tool (webSearch or imageSearch).
- Use the previousApp and sessionContext fields to determine what data the app needs. For example:
  - previousApp.kind = "dashboard" and sessionContext mentions search → needsTools=true, webSearch
  - previousApp.title contains "SpaceX" or "天气" → needsTools=true, webSearch
  - The app was originally built from a search query → needsTools=true, request the same or similar search
- Do NOT default to needsTools=false for timer.refresh. The whole point of timer.refresh is to re-generate the UI with complete data.

SPECIAL RULES FOR component.click EVENTS:
- If the button intent is "perform_search" and a "searchQuery" field is present, treat it as a NEW search for that topic.
  set needsTools=true, request webSearch and imageSearch for the searchQuery topic.
  Generate a COMPLETELY FRESH imageBlueprint — do NOT reuse image slots or queries from previous turns.
- If the button intent suggests refreshing, reloading, or fetching new data (e.g., "Refresh", "Get Latest", "Update Data", "刷新"), set needsTools=true.
- Use previousApp and sessionContext to determine what kind of data to fetch.
- If the intent is about internal UI state changes (e.g., "Switch tab", "Close modal"), set needsTools=false.

IMPORTANT: You may request MULTIPLE tools in a single decision. For example:
- User asks for images of a topic → request imageSearch (no need for webSearch + downloadResource)
- User provides multiple image URLs → request multiple downloadResource calls
Always use the EXACT URL the user provides for downloadResource. Do NOT modify or reconstruct URLs.
When requesting imageSearch, you should usually also return an imageBlueprint with 1-12 image slots.

Output ONLY valid JSON. No markdown fences, no explanations.`;

  // 从事件中提取关键信息（不发送完整 request）
  // 对于非 app.search 事件（如 timer.refresh, component.click 等），
  // 需要补充 previousApp 和 sessionContext，否则 LLM 无法判断是否需要工具。
  const eventSummary: Record<string, unknown> = {
    type: request.event.type,
    query:
      request.event.type === "app.search" ? request.event.query : undefined,
    intent:
      request.event.type === "component.click"
        ? request.event.target?.intent
        : undefined,
    // For perform_search clicks, expose the current search query so Phase 1
    // knows WHAT the user is searching for (not just that they clicked a button)
    ...(request.event.type === "component.click" &&
    request.event.target?.intent === "perform_search"
      ? {
          searchQuery:
            request.memory?.session?.search_query ??
            request.event.clientSnapshot?.localState?.values?.searchQuery ??
            request.event.clientSnapshot?.localState?.values?.search_query,
        }
      : {}),
    // 为 timer.refresh 事件补充 appTitle/appKind/appId 上下文
    ...(request.event.type === "timer.refresh"
      ? {
          appTitle: request.event.appTitle,
          appKind: request.event.appKind,
          appId: request.event.appId,
        }
      : {}),
    // 为非 app.search 事件补充当前 app 上下文（title, kind, description）
    ...(request.event.type !== "app.search" && request.previous?.app
      ? {
          previousApp: {
            title: request.previous.app.title,
            kind: request.previous.app.kind,
            description: request.previous.app.description,
          },
        }
      : {}),
    // 补充 session memory 上下文（可能包含上次搜索查询）
    ...(request.memory?.session &&
    Object.keys(request.memory.session).length > 0
      ? { sessionContext: request.memory.session }
      : {}),
  };
  const promptObj = {
    event: eventSummary,
    instruction:
      "Decide if tools are needed. Output ONLY the JSON decision object.",
  };
  const startedAt = Date.now();

  try {
    const result = await generateObject({
      model,
      schema: toolDecisionSchema,
      system: systemPrompt,
      prompt: JSON.stringify(promptObj),
      mode: "json",
      temperature: 0.1,
      maxTokens: 4000,
    });

    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request.session.sessionId,
      turn: request.session.turn,
      stage: "tool_decision",
      status: "success",
      durationMs: Date.now() - startedAt,
      payload: {
        request: {
          system: systemPrompt,
          prompt: promptObj,
          options: { mode: "json", temperature: 0.1, maxTokens: 4000 },
        },
        response: result.object,
      },
    });
    return result.object as ToolDecision;
  } catch (err) {
    console.warn(
      "[toolDecision] Failed, assuming no tools needed:",
      (err as Error).message?.slice(0, 100),
    );
    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request.session.sessionId,
      turn: request.session.turn,
      stage: "tool_decision",
      status: "failure",
      durationMs: Date.now() - startedAt,
      payload: {
        request: {
          system: systemPrompt,
          prompt: promptObj,
          options: { mode: "json", temperature: 0.1, maxTokens: 4000 },
        },
        error: err instanceof Error ? err.message : String(err),
        fallbackDecision: { needsTools: false },
      },
    });
    return { needsTools: false };
  }
}

// -----------------------------------------------------------
// Plan-derived tool decision (when Refine provides uiModules)
// -----------------------------------------------------------

/**
 * 从 Refine 的 uiModules 直接提取工具决策，跳过 AI 调用。
 * 确保每个模块的 web 和 image 搜索结果与该模块内容一一对应。
 */
function deriveToolDecisionFromPlan(uiModules: UIModulePlan[]): ToolDecision {
  const toolRequests: ToolDecision["toolRequests"] = [];
  const imageSlots: ImageBlueprint["slots"] = [];
  let slotIdx = 0;

  for (const mod of uiModules) {
    if (!mod.searchQueries) continue;

    // Web search queries → text content for this module
    if (mod.searchQueries.web) {
      for (const query of mod.searchQueries.web) {
        toolRequests!.push({
          id: `plan_${mod.moduleId}_web_${toolRequests!.length}`,
          toolName: "webSearch",
          args: { query, maxResults: 10 },
          reason: mod.purpose,
          moduleId: mod.moduleId,
        });
      }
    }

    // Image search queries → visual content for this module
    if (mod.searchQueries.image) {
      for (const query of mod.searchQueries.image) {
        toolRequests!.push({
          id: `plan_${mod.moduleId}_img_${toolRequests!.length}`,
          toolName: "imageSearch",
          args: { query, maxResults: 5 },
          reason: mod.purpose,
          moduleId: mod.moduleId,
        });

        // Auto-derive imageBlueprint slot for each image query
        slotIdx++;
        imageSlots.push({
          slotId: `s${slotIdx}`,
          purpose: mod.purpose,
          queryCandidates: [query],
          preferredAspect: "auto",
          required: true,
          bindTarget: {
            type: "image",
            sectionHint: mod.moduleId,
          },
        });
      }
    }
  }

  const hasTools = toolRequests.length > 0;
  return {
    needsTools: hasTools,
    toolRequests: hasTools ? toolRequests : undefined,
    imageBlueprint:
      imageSlots.length > 0
        ? { summary: "Auto-derived from UI framework plan", slots: imageSlots }
        : undefined,
  };
}

// -----------------------------------------------------------
// Phase 2: 工具执行
// -----------------------------------------------------------

interface ToolExecResult {
  moduleId?: string;
  toolRequest: {
    id: string;
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
    moduleId?: string;
  };
  result: unknown;
}

async function executeRequestedTools(
  toolRequests: Array<{
    id: string;
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
    moduleId?: string;
  }>,
  request: AUIRRequest,
): Promise<ToolExecResult[]> {
  const results: ToolExecResult[] = [];
  const pageLogContext = getPageLogContext(request);

  for (const tr of toolRequests) {
    const startedAt = Date.now();
    try {
      console.log(`[executeTools] Executing: ${tr.toolName} (${tr.id})`);
      const execResult = await executeTool(tr.toolName, tr.args);
      results.push({
        moduleId: tr.moduleId,
        toolRequest: tr,
        result: execResult.result,
      });
      await appendRuntimeLog({
        type: "tool.execution",
        pageLogId: pageLogContext?.pageLogId,
        sessionId: request.session.sessionId,
        turn: request.session.turn,
        stage: "tool_execution",
        status: "success",
        durationMs: Date.now() - startedAt,
        payload: { toolRequest: tr, result: execResult },
      });
      console.log(
        `[executeTools] ${tr.toolName} completed (source: ${execResult.source})`,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[executeTools] ${tr.toolName} failed:`, errMsg);
      await appendRuntimeLog({
        type: "tool.execution",
        pageLogId: pageLogContext?.pageLogId,
        sessionId: request.session.sessionId,
        turn: request.session.turn,
        stage: "tool_execution",
        status: "failure",
        durationMs: Date.now() - startedAt,
        payload: { toolRequest: tr, error: errMsg },
      });
      results.push({
        moduleId: tr.moduleId,
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
  if (json.length > 8000) {
    try {
      const parsed = JSON.parse(json);
      if (parsed.results && Array.isArray(parsed.results)) {
        parsed.results = parsed.results.slice(0, 10);
      }
      if (parsed.AbstractText && parsed.AbstractText.length > 2000) {
        parsed.AbstractText = parsed.AbstractText.slice(0, 2000) + "...";
      }
      return parsed;
    } catch {
      return { _truncated: true, _preview: json.slice(0, 2000) };
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
3. If IMAGE SLOT CONTRACT placeholders exist, prefer them according to slot order and binding hints.
4. *** MANDATORY: Set diagnostics.simulatedData = false. The data above is REAL, not simulated. ***
5. *** MANDATORY: Set confidence = "real" on ALL metric/statistic/kpi_card nodes. ***
6. *** FORBIDDEN: Do NOT add alert nodes with titles like "Simulated Data", "模拟数据", "Demo Data", or any disclaimer about data being fake. ***
7. *** FORBIDDEN: Do NOT add text saying "基于模拟数据", "values are simulated", "demo purposes", or similar disclaimers. ***
8. DO NOT output a loading alert or placeholder UI — output the FINAL UI with all tool data integrated.
=== END TOOL RESULTS ===`;
}

/**
 * 构建模块分组的工具结果摘要（注入到 system prompt）。
 * 按 moduleId 分组，每组内 web 和 image 结果放在一起，
 * 让 Phase 3 的 AI 看到图文对应关系。
 */
function buildModuleResultsSupplement(
  toolResults: ToolExecResult[],
  uiModules: UIModulePlan[],
): string {
  if (toolResults.length === 0) return "";

  const moduleMap = new Map<string, UIModulePlan>();
  for (const mod of uiModules) {
    moduleMap.set(mod.moduleId, mod);
  }

  // Group results by moduleId
  const grouped = new Map<string, ToolExecResult[]>();
  const ungrouped: ToolExecResult[] = [];
  for (const tr of toolResults) {
    const mid = tr.moduleId;
    if (mid && grouped.has(mid)) {
      grouped.get(mid)!.push(tr);
    } else if (mid) {
      grouped.set(mid, [tr]);
    } else {
      ungrouped.push(tr);
    }
  }

  let downloadIdx = 0;
  const sections: string[] = [];

  for (const [moduleId, results] of grouped) {
    const mod = moduleMap.get(moduleId);
    const header = mod
      ? `Module: ${moduleId} — ${mod.purpose} (suggested: ${mod.suggestedComponent})`
      : `Module: ${moduleId}`;

    const items = results.map((tr) => {
      const isDownload = tr.toolRequest.toolName === "downloadResource";
      const sanitized = sanitizeToolResult(
        tr.result,
        isDownload ? downloadIdx++ : -1,
      );
      return `    ${tr.toolRequest.toolName}("${tr.toolRequest.args.query ?? tr.toolRequest.args.url ?? ""}"): ${JSON.stringify(sanitized).slice(0, 1500)}`;
    });

    sections.push(`  ${header}\n${items.join("\n")}`);
  }

  // Append ungrouped results (from plan-derived downloads, etc.)
  if (ungrouped.length > 0) {
    const items = ungrouped.map((tr) => {
      const isDownload = tr.toolRequest.toolName === "downloadResource";
      const sanitized = sanitizeToolResult(
        tr.result,
        isDownload ? downloadIdx++ : -1,
      );
      return `    ${tr.toolRequest.toolName}: ${JSON.stringify(sanitized).slice(0, 1500)}`;
    });
    sections.push(`  Other results\n${items.join("\n")}`);
  }

  return `

=== MODULE-SCOPED TOOL RESULTS ===
The following tools have been executed with data organized by UI module.
Each module's text and image results are grouped together — use them to populate that module's content.
${sections.join("\n\n")}

CRITICAL INSTRUCTIONS:
1. Create UI nodes for EACH module listed above. Do not skip any module.
2. Use the web results for text/data content and image results for visual content within each module.
3. For {{DOWNLOADED_IMAGE_N}} placeholders: use them as the "src" field in "image" nodes.
4. *** MANDATORY: Set diagnostics.simulatedData = false. The data above is REAL, not simulated. ***
5. *** FORBIDDEN: Do NOT add "Simulated Data" alerts or disclaimers. ***
6. DO NOT output a loading/placeholder UI — output the FINAL UI with all module data integrated.
=== END MODULE-SCOPED RESULTS ===`;
}

function buildImageSlotContractSupplement(
  toolResults: ToolExecResult[],
  blueprint: ImageBlueprint,
): string {
  const downloadUrls: string[] = [];
  for (const tr of toolResults) {
    if (tr.toolRequest.toolName !== "downloadResource") continue;
    const result = tr.result as Record<string, unknown>;
    if (!result || result.error) continue;
    const url = String(result.url ?? "");
    if (url) downloadUrls.push(url);
  }

  // 每个 slot 对应 1 个 placeholder index（顺序一一对应）
  const lines = blueprint.slots.map((slot, index) => {
    const placeholder = `{{DOWNLOADED_IMAGE_${index}}}`;
    const slotLine = `slotId=${slot.slotId}; purpose=${slot.purpose}; preferredAspect=${slot.preferredAspect ?? "auto"}; bind=${slot.bindTarget.type}:${slot.bindTarget.nodeId ?? slot.bindTarget.sectionHint ?? ""}; queries=[${slot.queryCandidates.join(" | ")}]`;
    return `${index + 1}. ${slotLine} -> candidate: ${placeholder}`;
  });

  return `

=== IMAGE SLOT CONTRACT ===
The following image slots were planned BEFORE UI generation.
You MUST create the exact image-bearing nodes for these slots and prefer the listed placeholder candidates in order.
${lines.join("\n")}
If a slot binds to a nodeId, reuse that exact id in the final UI.
Do not leave required slots empty.

*** CRITICAL RULES ***
- Each slot MUST use a DIFFERENT placeholder. NEVER reuse the same placeholder for multiple slots.
- Set the "src" field of each image node to the EXACT placeholder string listed for that slot.
- In memory.app.imageBindings, each entry MUST have a DIFFERENT usedCandidateIndex matching its slot order (0, 1, 2, ...).
- If a placeholder is {{DOWNLOADED_IMAGE_3}}, use EXACTLY "{{DOWNLOADED_IMAGE_3}}" as the src — not 0, not 1, but 3.
=== END IMAGE SLOT CONTRACT ===`;
}

function buildSlotBindingMap(
  response: AUIRResponse,
  blueprint?: ImageBlueprint,
  totalDownloaded?: number,
): Map<
  string,
  {
    slotId: string;
    candidatePlaceholder: string;
  }
> {
  const map = new Map<
    string,
    { slotId: string; candidatePlaceholder: string }
  >();
  if (!blueprint || blueprint.slots.length === 0) return map;

  const bindings = (
    response.next.memory?.app as Record<string, unknown> | undefined
  )?.imageBindings as
    | Array<{ slotId: string; nodeId?: string; usedCandidateIndex?: number }>
    | undefined;

  // 每个 slot 占用 1 个 placeholder index（按 slot 在 blueprint 中的顺序）
  for (let i = 0; i < blueprint.slots.length; i++) {
    const slot = blueprint.slots[i];
    const bindingFromAI = bindings?.find(
      (b: { slotId: string }) => b.slotId === slot.slotId,
    );
    const nodeId = bindingFromAI?.nodeId ?? slot.bindTarget.nodeId;
    if (!nodeId) continue;

    // slot index = placeholder index（顺序一一对应）
    const placeholderIndex = i;
    // 如果超出实际下载数量，使用模运算均匀分配
    // （避免多个 slot 共享同一张图，而是循环分配到可用图片）
    const safeIndex =
      totalDownloaded && totalDownloaded > 0
        ? placeholderIndex % totalDownloaded
        : placeholderIndex;

    map.set(nodeId, {
      slotId: slot.slotId,
      candidatePlaceholder: `{{DOWNLOADED_IMAGE_${safeIndex}}}`,
    });
  }

  return map;
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

/** generateNextAUIRState 的返回值（包含工具结果供调用方做延迟图片替换） */
export interface GenerateResult {
  response: AUIRResponse;
  toolResults: ToolExecResult[];
  imageBlueprint?: ImageBlueprint;
}

/** 使用 Vercel AI SDK generateObject 生成下一版 AUIR 状态 */
export async function generateNextAUIRState(
  request: AUIRRequest,
  refineResult?: RefineOutput,
  thinking?: boolean,
): Promise<GenerateResult> {
  const model = getModel(
    thinking === true ? "enabled" : thinking === false ? "disabled" : undefined,
  );
  const pageLogContext = getPageLogContext(request);

  // ── Phase 1: 工具决策 ──
  // 当 Refine 提供了 uiModules 时，直接从 plan 提取工具决策（无需 AI 调用）
  console.log("[generateNextState] Phase 1: deciding tool needs...");
  let decision: ToolDecision;
  const hasFrameworkPlan =
    refineResult?.uiModules && refineResult.uiModules.length > 0;

  if (hasFrameworkPlan) {
    decision = deriveToolDecisionFromPlan(refineResult!.uiModules!);
    console.log(
      `[generateNextState] Phase 1: derived from plan — ${decision.toolRequests?.length ?? 0} tool(s), ${decision.imageBlueprint?.slots?.length ?? 0} image slot(s)`,
    );
    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request.session.sessionId,
      turn: request.session.turn,
      stage: "tool_decision",
      status: "success",
      durationMs: 0,
      payload: {
        source: "plan-derived",
        moduleCount: refineResult!.uiModules!.length,
        toolRequestCount: decision.toolRequests?.length ?? 0,
        imageSlotCount: decision.imageBlueprint?.slots?.length ?? 0,
      },
    });
  } else {
    decision = await decideToolNeeds(request);
  }

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
    toolResults = await executeRequestedTools(decision.toolRequests, request);

    // Phase 2.5-pre: Execute per-slot image searches for uncovered slots.
    // When the tool decision AI returns an imageBlueprint but only broad
    // imageSearch queries, the slot-specific queryCandidates are never
    // actually searched. This step fills the gap by executing per-slot searches
    // so each slot gets cuisine/topic-specific images.
    if (decision.imageBlueprint && decision.imageBlueprint.slots.length > 0) {
      const existingImageSearchQueries = new Set(
        toolResults
          .filter((tr) => tr.toolRequest.toolName === "imageSearch")
          .map((tr) =>
            String(
              (tr.toolRequest.args as Record<string, unknown>)?.query ?? "",
            ).toLowerCase(),
          ),
      );

      const uncoveredSlots = decision.imageBlueprint.slots.filter((slot) => {
        return !slot.queryCandidates.some((candidate) => {
          const lc = candidate.toLowerCase();
          for (const existingQuery of existingImageSearchQueries) {
            if (existingQuery.includes(lc) || lc.includes(existingQuery)) {
              return true;
            }
          }
          return false;
        });
      });

      if (uncoveredSlots.length > 0) {
        console.log(
          `[generateNextState] Phase 2.5-pre: ${uncoveredSlots.length}/${decision.imageBlueprint.slots.length} image slots uncovered by existing searches, executing per-slot imageSearch...`,
        );
        await appendRuntimeLog({
          type: "runtime.per_slot_search.executed",
          pageLogId: getPageLogContext(request)?.pageLogId,
          sessionId: request.session.sessionId,
          turn: request.session.turn,
          stage: "tool_execution",
          status: "info",
          payload: {
            uncoveredCount: uncoveredSlots.length,
            totalSlotCount: decision.imageBlueprint.slots.length,
            queries: uncoveredSlots.map((s) => s.queryCandidates[0]),
          },
        });
        const perSlotRequests = uncoveredSlots.map((slot) => ({
          id: `slot_img_${slot.slotId}`,
          toolName: "imageSearch" as const,
          args: { query: slot.queryCandidates[0], maxResults: 5 },
          reason: `Per-slot image search for: ${slot.purpose}`,
        }));
        const perSlotResults = await executeRequestedTools(
          perSlotRequests,
          request,
        );
        toolResults.push(...perSlotResults);
      }
    }

    // Phase 2.5: 基于图片蓝图优先下载候选图片，不再无限制批量下载全部搜索结果
    const imageSearchResults = toolResults.filter(
      (tr) =>
        tr.toolRequest.toolName === "imageSearch" &&
        !(tr.result as Record<string, unknown>)?.error,
    );
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
    const slotPlan = decision.imageBlueprint?.slots ?? [];
    const imageUrlsToDownload: string[] = [];
    /** Track which domains have already been used (for diversity) */
    const usedDomains = new Set<string>();

    const getDomain = (url: string): string => {
      try {
        return new URL(url).hostname;
      } catch {
        return "";
      }
    };

    const collectUrl = (url: string, force = false) => {
      if (!url || !url.startsWith("http")) return false;
      if (imageUrlsToDownload.length >= 18) return false;
      if (!force && existingDownloads.has(url)) return false;
      imageUrlsToDownload.push(url);
      existingDownloads.add(url);
      usedDomains.add(getDomain(url));
      return true;
    };

    // 1) 优先按 slot 规划收集候选 URL，每个 slot 确保下载 1 张
    for (const slot of slotPlan) {
      const normalizedPurpose = (slot.purpose || "").toLowerCase();
      const normalizedHints = [
        ...slot.queryCandidates.map((q) => q.toLowerCase()),
        normalizedPurpose,
        (slot.bindTarget.sectionHint || "").toLowerCase(),
      ].filter(Boolean);

      // 找到与该 slot 对应的 imageSearch 结果（通过 query 匹配）
      const slotSearchResult = imageSearchResults.find((isr) => {
        const isrQuery = String(
          (isr.toolRequest.args as Record<string, unknown>)?.query ?? "",
        ).toLowerCase();
        return slot.queryCandidates.some(
          (q) =>
            isrQuery.includes(q.toLowerCase()) ||
            q.toLowerCase().includes(isrQuery),
        );
      });

      const matchesSlot = (text: string, url: string) => {
        const t = (text + " " + url).toLowerCase();
        return normalizedHints.some((h) => h && t.includes(h.slice(0, 8)));
      };

      let collected = false;

      // 优先精准匹配：先从对应的搜索结果中找
      if (slotSearchResult) {
        const results = (slotSearchResult.result as Record<string, unknown>)
          ?.results as Array<Record<string, unknown>> | undefined;
        if (results) {
          for (const r of results) {
            if (collected) break;
            const url = String(r.imageUrl ?? "");
            const title = String(r.title ?? "");
            if (url && !existingDownloads.has(url)) {
              // 优先精准匹配，否则只要是新 URL 就取
              if (matchesSlot(title, url) || !collected) {
                collectUrl(url);
                collected = true;
              }
            }
          }
        }
      }

      // 兜底：从所有搜索结果中找未被收集的图
      if (!collected) {
        // 优先找来自新域名的 URL（避免同源图片重复）
        for (const isr of imageSearchResults) {
          if (collected) break;
          const results = (isr.result as Record<string, unknown>)?.results as
            | Array<Record<string, unknown>>
            | undefined;
          if (!results) continue;
          for (const r of results) {
            if (collected) break;
            const url = String(r.imageUrl ?? "");
            if (url && !existingDownloads.has(url)) {
              // 优先选择来自新域名的图片
              if (!usedDomains.has(getDomain(url))) {
                collectUrl(url);
                collected = true;
              }
            }
          }
        }
        // 如果没有新域名的图，退而求其次接受任意新 URL
        if (!collected) {
          for (const isr of imageSearchResults) {
            if (collected) break;
            const results = (isr.result as Record<string, unknown>)?.results as
              | Array<Record<string, unknown>>
              | undefined;
            if (!results) continue;
            for (const r of results) {
              if (collected) break;
              const url = String(r.imageUrl ?? "");
              if (url && !existingDownloads.has(url)) {
                collectUrl(url);
                collected = true;
              }
            }
          }
        }
        // 仍然没有找到，强制下载第一个可用 URL（允许重复）
        if (!collected) {
          for (const isr of imageSearchResults) {
            if (collected) break;
            const results = (isr.result as Record<string, unknown>)?.results as
              | Array<Record<string, unknown>>
              | undefined;
            if (!results || results.length === 0) continue;
            const url = String(results[0].imageUrl ?? "");
            if (url) {
              collectUrl(url, true);
              collected = true;
            }
          }
        }
      }
    }

    // 2) 兜底：没有蓝图时保留旧行为（最多 12 张）
    if (slotPlan.length === 0) {
      for (const isr of imageSearchResults) {
        const results = (isr.result as Record<string, unknown>)?.results as
          | Array<Record<string, unknown>>
          | undefined;
        if (!results) continue;
        for (const r of results) {
          const url = String(r.imageUrl ?? "");
          if (imageUrlsToDownload.length >= 12) break;
          collectUrl(url);
        }
      }
      for (const sr of webSearchResults) {
        const results = (sr.result as Record<string, unknown>)?.results as
          | Array<Record<string, unknown>>
          | undefined;
        if (!results) continue;
        for (const r of results) {
          const url = String(r.url ?? "");
          if (imageUrlsToDownload.length >= 12) break;
          if (/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(url)) collectUrl(url);
        }
      }
    }

    if (imageUrlsToDownload.length > 0) {
      console.log(
        `[generateNextState] Phase 2.5: downloading ${imageUrlsToDownload.length} slot-aware image(s)`,
      );
      const autoDownloadRequests = imageUrlsToDownload.map((url, i) => ({
        id: `auto_dl_${i}`,
        toolName: "downloadResource" as const,
        args: { url, expectedType: "image" as const },
        reason: "Auto-download image for image slot planning",
      }));
      const autoResults = await executeRequestedTools(
        autoDownloadRequests,
        request,
      );
      toolResults.push(...autoResults);

      // ── Phase 2.5-retry: 替换失败的下载 URL ──
      // 对于下载失败的 slot，从搜索结果中找替代 URL 重试
      const failedIndices = new Set<number>();
      for (let i = 0; i < autoResults.length; i++) {
        const result = autoResults[i].result as Record<string, unknown>;
        if (result?.error) {
          failedIndices.add(i);
        }
      }

      if (failedIndices.size > 0) {
        console.log(
          `[generateNextState] Phase 2.5-retry: ${failedIndices.size} download(s) failed, trying alternative URLs...`,
        );

        // 收集所有已知的候选图片 URL（来自搜索结果）
        const allCandidateUrls: string[] = [];
        for (const isr of imageSearchResults) {
          const results = (isr.result as Record<string, unknown>)?.results as
            | Array<Record<string, unknown>>
            | undefined;
          if (!results) continue;
          for (const r of results) {
            const url = String(r.imageUrl ?? "");
            if (url && !existingDownloads.has(url)) {
              allCandidateUrls.push(url);
            }
          }
        }

        // 对每个失败的下载，尝试替代 URL
        const retryRequests: Array<{
          id: string;
          toolName: "downloadResource";
          args: Record<string, unknown>;
          reason: string;
        }> = [];
        let retryIdx = 0;
        for (const failedIdx of failedIndices) {
          // 找一个未被使用过的替代 URL
          while (retryIdx < allCandidateUrls.length) {
            const altUrl = allCandidateUrls[retryIdx++];
            if (!existingDownloads.has(altUrl)) {
              existingDownloads.add(altUrl);
              retryRequests.push({
                id: `retry_dl_${failedIdx}`,
                toolName: "downloadResource" as const,
                args: { url: altUrl, expectedType: "image" as const },
                reason: `Retry download for failed slot ${failedIdx} (original: ${imageUrlsToDownload[failedIdx]?.slice(0, 60)}...)`,
              });
              break;
            }
          }
        }

        if (retryRequests.length > 0) {
          console.log(
            `[generateNextState] Phase 2.5-retry: attempting ${retryRequests.length} alternative download(s)`,
          );
          const retryResults = await executeRequestedTools(
            retryRequests,
            request,
          );
          toolResults.push(...retryResults);
        }
      }
    }

    if (decision.imageBlueprint) {
      const blueprintLogContext = getPageLogContext(request);
      await appendRuntimeLog({
        type: "runtime.image_blueprint.resolved",
        pageLogId: blueprintLogContext?.pageLogId,
        sessionId: request.session.sessionId,
        turn: request.session.turn,
        stage: "tool_execution",
        status: "success",
        payload: {
          slotCount: decision.imageBlueprint.slots.length,
          downloadedCount: imageUrlsToDownload.length,
          blueprint: decision.imageBlueprint,
        },
      });
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
    if (hasFrameworkPlan && refineResult?.uiModules) {
      // 模块分组结果（图文对应）
      systemPrompt += buildModuleResultsSupplement(
        toolResults,
        refineResult.uiModules,
      );
    } else {
      // 扁平结果（现有行为）
      systemPrompt += buildToolResultsSupplement(toolResults);
    }
  }
  if (decision.imageBlueprint && decision.imageBlueprint.slots.length > 0) {
    systemPrompt += buildImageSlotContractSupplement(
      toolResults,
      decision.imageBlueprint,
    );
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
    request,
  );

  // NOTE: 图片占位符替换和真实数据标记已移至 runtime.ts 在后处理之后执行。
  // 这样后处理 AI 不会接收到巨大的 data URL，避免截断/损坏图片数据。

  // ── Post-process: 检测并修复 loading/placeholder 页面（无论是否有工具结果）──
  if (response) {
    const injectedTimerRefresh = detectAndFixLoadingPage(response);
    if (injectedTimerRefresh) {
      const pageLogContext = getPageLogContext(request);
      await appendRuntimeLog({
        type: "validation.loading_page.fixed",
        pageLogId: pageLogContext?.pageLogId,
        sessionId: request.session.sessionId,
        turn: request.session.turn,
        stage: "validation",
        status: "success",
        payload: {
          message:
            "AI returned a loading page without timer_refresh; auto-refresh timer injected.",
        },
      });
    }
  }

  return { response, toolResults, imageBlueprint: decision.imageBlueprint };
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
  request?: AUIRRequest,
): Promise<AUIRResponse> {
  const pageLogContext = request ? getPageLogContext(request) : undefined;
  // 尝试 1: 正常生成（maxTokens: 12000）
  let attemptStartedAt = Date.now();
  try {
    console.log(
      "[generateWithRetry] Attempt 1: full generation (65536 tokens)",
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
          maxTokens: 65536,
        }).then((r) => r.object),
      constraints,
    );
    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request?.session.sessionId,
      turn: request?.session.turn,
      stage: "ui_generation",
      status: "success",
      durationMs: Date.now() - attemptStartedAt,
      payload: {
        attempt: 1,
        request: {
          system: systemPrompt,
          prompt: promptObj,
          options: { mode: "json", temperature: 0.4, maxTokens: 65536 },
        },
        response,
      },
    });
    return response;
  } catch (err) {
    console.warn(
      "[generateWithRetry] Attempt 1 failed:",
      (err as Error).message?.slice(0, 100),
    );
    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request?.session.sessionId,
      turn: request?.session.turn,
      stage: "ui_generation",
      status: "failure",
      durationMs: Date.now() - attemptStartedAt,
      payload: {
        attempt: 1,
        request: {
          system: systemPrompt,
          prompt: promptObj,
          options: { mode: "json", temperature: 0.4, maxTokens: 65536 },
        },
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }

  // 尝试 2: 截断 system prompt + 降低 temperature
  attemptStartedAt = Date.now();
  try {
    console.log(
      "[generateWithRetry] Attempt 2: truncated system prompt (32000 tokens)",
    );
    const shortSystem =
      systemPrompt.length > 16000
        ? systemPrompt.slice(0, 16000) +
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
          maxTokens: 32000,
        }).then((r) => r.object),
      constraints,
    );
    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request?.session.sessionId,
      turn: request?.session.turn,
      stage: "ui_generation",
      status: "success",
      durationMs: Date.now() - attemptStartedAt,
      payload: {
        attempt: 2,
        request: {
          system: shortSystem,
          prompt: promptObj,
          options: { mode: "json", temperature: 0.3, maxTokens: 32000 },
        },
        response,
      },
    });
    return response;
  } catch (err) {
    console.warn(
      "[generateWithRetry] Attempt 2 failed:",
      (err as Error).message?.slice(0, 100),
    );
    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request?.session.sessionId,
      turn: request?.session.turn,
      stage: "ui_generation",
      status: "failure",
      durationMs: Date.now() - attemptStartedAt,
      payload: {
        attempt: 2,
        request: {
          prompt: promptObj,
          options: { mode: "json", temperature: 0.3, maxTokens: 32000 },
        },
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }

  // 尝试 3: 最小化 prompt，不含工具结果
  attemptStartedAt = Date.now();
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
          maxTokens: 32000,
        }).then((r) => r.object),
      constraints,
    );
    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request?.session.sessionId,
      turn: request?.session.turn,
      stage: "ui_generation",
      status: "success",
      durationMs: Date.now() - attemptStartedAt,
      payload: {
        attempt: 3,
        request: {
          system: minimalSystem,
          prompt: minimalPrompt,
          options: { mode: "json", temperature: 0.3, maxTokens: 32000 },
        },
        response,
      },
    });
    return response;
  } catch (err) {
    console.error(
      "[generateWithRetry] All attempts failed:",
      (err as Error).message?.slice(0, 200),
    );
    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request?.session.sessionId,
      turn: request?.session.turn,
      stage: "ui_generation",
      status: "failure",
      durationMs: Date.now() - attemptStartedAt,
      payload: {
        attempt: 3,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }

  // 最终降级: 返回基础 UI
  console.error("[generateWithRetry] Falling back to basic UI generation");
  const fallback = createBasicFallbackResponse(promptObj);
  await appendRuntimeLog({
    type: "ui_generation.fallback",
    pageLogId: pageLogContext?.pageLogId,
    sessionId: request?.session.sessionId,
    turn: request?.session.turn,
    stage: "ui_generation",
    status: "failure",
    payload: { response: fallback },
  });
  return fallback;
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

/**
 * 从前一轮 UI 树中提取所有 data URL（base64 图片）。
 * 当本轮没有工具执行结果时，这些 data URL 可作为 fallback 用于占位符替换。
 */
export function extractDataUrlsFromUITree(
  ui: UINode | null | undefined,
): string[] {
  if (!ui) return [];
  const dataUrls: string[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    // card.image 可以是 data URL 字符串或 image 对象
    if (obj.type === "card") {
      const img = obj.image;
      if (typeof img === "string" && img.startsWith("data:")) {
        dataUrls.push(img);
      } else if (
        img &&
        typeof img === "object" &&
        typeof (img as Record<string, unknown>).src === "string" &&
        ((img as Record<string, unknown>).src as string).startsWith("data:")
      ) {
        dataUrls.push((img as Record<string, unknown>).src as string);
      }
    }

    // image.src
    if (
      obj.type === "image" &&
      typeof obj.src === "string" &&
      obj.src.startsWith("data:")
    ) {
      dataUrls.push(obj.src);
    }

    // 任意节点的 src 字段
    if (
      typeof obj.src === "string" &&
      obj.src.startsWith("data:") &&
      obj.type !== "image" &&
      obj.type !== "card"
    ) {
      dataUrls.push(obj.src);
    }

    // 递归遍历
    if (Array.isArray(obj.children)) {
      for (const child of obj.children) walk(child);
    }
    if (obj.primary) walk(obj.primary);
    if (obj.secondary) walk(obj.secondary);
    if (Array.isArray(obj.tabs)) {
      for (const tab of obj.tabs as Array<Record<string, unknown>>) {
        if (Array.isArray(tab.children)) {
          for (const child of tab.children) walk(child);
        }
      }
    }
    if (Array.isArray(obj.footer)) {
      for (const child of obj.footer) walk(child);
    }
    if (Array.isArray(obj.items)) {
      for (const item of obj.items as Array<Record<string, unknown>>) {
        if (Array.isArray(item.children)) {
          for (const child of item.children) walk(child);
        }
      }
    }
  }

  walk(ui);
  return dataUrls;
}

/**
 * 从前一轮 UI 树中提取 data URL，构造合成的 ToolExecResult[]。
 * 当本轮没有工具执行结果时，让 postProcessImageUrls 仍能用旧 data URL 替换占位符。
 */
export function buildFallbackToolResults(
  previousUI: UINode | null | undefined,
): ToolExecResult[] {
  const dataUrls = extractDataUrlsFromUITree(previousUI);
  if (dataUrls.length === 0) return [];

  console.log(
    `[postProcess] Extracted ${dataUrls.length} data URL(s) from previous UI for fallback image replacement`,
  );

  // 将每个 data URL 包装为 downloadResource 的结果
  return dataUrls.map((dataUrl, i) => ({
    toolRequest: {
      id: `fallback_prev_img_${i}`,
      toolName: "downloadResource" as const,
      args: {
        url: `fallback://previous-ui/image-${i}`,
        expectedType: "image" as const,
      },
      reason: "Fallback: data URL extracted from previous UI tree",
    },
    result: {
      url: `fallback://previous-ui/image-${i}`,
      contentType: dataUrl.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg",
      resourceType: "image",
      data: dataUrl,
      byteSize: Math.round((dataUrl.length * 3) / 4), // approximate base64 → bytes
      downloadedAt: new Date().toISOString(),
    },
  }));
}

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

/** 替换 UI 树中的图片占位符为实际 data URL（导出供 runtime.ts 延迟调用） */
export function postProcessImageUrls(
  response: AUIRResponse,
  toolResults: ToolExecResult[],
  imageBlueprint?: ImageBlueprint,
): void {
  const { urlMap, dataUrls, failedUrls } = buildDownloadMaps(toolResults);
  const hasDownloads =
    urlMap.size > 0 || dataUrls.length > 0 || failedUrls.size > 0;

  let replaceCount = 0;

  const slotBindingMap = hasDownloads
    ? buildSlotBindingMap(response, imageBlueprint, dataUrls.length)
    : new Map<string, { slotId: string; candidatePlaceholder: string }>();

  function applySlotBinding(node: Record<string, unknown>): boolean {
    const nodeId = String(node.id ?? "");
    if (!nodeId) return false;
    const binding = slotBindingMap.get(nodeId);
    if (!binding) return false;

    const value = resolveValue(binding.candidatePlaceholder);
    if (!value) return false;

    if (node.type === "image" && typeof node.src === "string") {
      node.src = value;
      replaceCount++;
      return true;
    }

    if (node.type === "card" && typeof node.image === "string") {
      node.image = value;
      replaceCount++;
      return true;
    }

    if (typeof node.src === "string") {
      node.src = value;
      replaceCount++;
      return true;
    }

    return false;
  }

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
      // 下载失败 fallback: 使用原始 URL（http/https 均可在浏览器直接加载图片）
      const failedUrl = failedUrls.get(idx);
      if (
        failedUrl &&
        (failedUrl.startsWith("https://") || failedUrl.startsWith("http://"))
      ) {
        console.warn(
          `[postProcess] Download failed for [${idx}], using original URL as fallback`,
        );
        return failedUrl;
      }
      // 任意 failed URL fallback
      if (failedUrls.size > 0) {
        const firstFailed = failedUrls.values().next().value;
        if (
          firstFailed &&
          (firstFailed.startsWith("https://") ||
            firstFailed.startsWith("http://"))
        ) {
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

  // 清理无法解析的占位符（防止 AI 自行发明的 {{DOWNLOADED_IMAGE_N}} 残留）
  function cleanUnresolvedPlaceholder(val: string): string {
    const placeholderMatch = val.match(/\{\{DOWNLOADED_IMAGE_(\d+)\}\}/);
    if (!placeholderMatch) return val;
    const idx = parseInt(placeholderMatch[1], 10);
    if (idx < dataUrls.length) return val; // 有效占位符，保留
    // 无效占位符：清理为空字符串
    console.warn(
      `[postProcess] Cleaning unresolved placeholder: ${val} (index ${idx} out of range, have ${dataUrls.length})`,
    );
    return "";
  }

  function walkAndReplace(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    // 蓝图绑定优先：让图片落到规划好的节点位置
    applySlotBinding(obj);

    // image.src
    if (obj.type === "image" && typeof obj.src === "string") {
      obj.src = cleanUnresolvedPlaceholder(obj.src);
      const r = resolveValue(obj.src as string);
      if (r) {
        obj.src = r;
        replaceCount++;
      }
    }
    // card.image
    if (obj.type === "card" && typeof obj.image === "string") {
      obj.image = cleanUnresolvedPlaceholder(obj.image);
      const r = resolveValue(obj.image as string);
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
      obj.src = cleanUnresolvedPlaceholder(obj.src);
      const r = resolveValue(obj.src as string);
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
export function forceRealDataMarking(
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
function detectAndFixLoadingPage(response: AUIRResponse): boolean {
  const ui = response.next.ui;
  if (!ui || typeof ui !== "object") return false;

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

  if (!isLoadingPage) return false;

  // Check if timer_refresh already exists in the UI tree
  const hasTimerRefresh = walkFindTimerRefresh(ui);
  if (hasTimerRefresh) {
    console.log(
      "[detectLoading] Loading page has timer_refresh — intentional, allowing auto-refresh",
    );
    return false;
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
  return true;
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
