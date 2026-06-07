// ============================================================
// AI Post-Process Mode — 生成后 UI 审查与修正
// ============================================================
// 当用户开启 Post-Process Mode 时，在 AI 生成新 UI 后，
// 调用第二个 AI 对 UI 进行三方面审查：
//   1. 功能审计 — 确保交互元素的功能与其外观匹配
//   2. 布局优化 — 改进不美观的排版和空间利用
//   3. 位置稳定性 — 保持相同元素在相同渲染位置
//
// 架构：独立于主生成管线的后处理步骤
//   generateNextAUIRState → postProcessUIState → 返回修正后 UI
// ============================================================

import type { UINode } from "@/auir/types";
import { appendRuntimeLog } from "@/runtime/logging/server";
import type { PageLogContext } from "@/runtime/logging/types";
import type { LanguageModelV1 } from "ai";
import { generateText } from "ai";
import { getModel } from "./model";

// -----------------------------------------------------------
// 类型
// -----------------------------------------------------------

export interface PostProcessInput {
  /** 上一轮的 UI 树（首次生成为 null） */
  previousUI: UINode | null;
  /** 新生成的 UI 树 */
  newUI: UINode;
  /** 用户原始查询 */
  userQuery: string;
  /** App 标题（如有） */
  appTitle?: string;
  /** App 类型（如有） */
  appKind?: string;
}

export interface PostProcessOutput {
  /** 修正后的 UI 树 */
  correctedUI: UINode;
  /** 后处理 AI 做出的修改摘要 */
  changes: string[];
  /** 是否成功完成审查 */
  ok: boolean;
  /** 错误信息（如有） */
  error?: string;
}

// -----------------------------------------------------------
// System Prompt — UI Review Engine
// -----------------------------------------------------------

function buildPostProcessSystemPrompt(): string {
  return `You are the UI Review Engine — a quality-assurance AI for an AI-UI co-execution system.

Your role is to review AI-generated user interfaces BEFORE they are rendered to the user.
You receive a newly generated UI tree and (optionally) the previous UI tree from the last round.
You produce a CORRECTED version of the new UI tree.

The UI system uses a semantic component tree (AUIR protocol v0.3). Each node has:
  - "id": unique identifier string
  - "type": component type (see reference below)
  - "visible": optional boolean (false = hidden)
  - "semanticRole": optional role hint (navigation, input, analysis_action, local_adjustment, display, warning, confirmation, tool_result, simulation_result)
  - "intent": optional intent description (what clicking this element does)
  - "expectedEffect": optional description of what happens after interaction
  - "layout": optional layout hints (width, height, align, justify, grow, order)
  - "style": optional style tokens (tone, density, emphasis)
  - "children": array of child nodes (for container types)
  - Type-specific fields (see reference below)

=== COMPONENT REFERENCE (key types only) ===

LAYOUT NODES:
  screen { title?, layoutMode?, gap?, children[] }
  container { direction?("row"|"column"|"grid"), gap?, wrap?, columns?, children[] }
  grid { columns(1-6|"auto"), gap?, children[] }
  split { orientation("horizontal"|"vertical"), ratio?("1:1"|"1:2"|"2:1"|"1:3"|"3:1"), primary, secondary }
  region { region("header"|"sidebar"|"main"|"inspector"|"footer"|"toolbar"|"results"|"logs"), gap?, children[] }
  panel { title?, subtitle?, gap?, children[] }
  tabs { activeTab, gap?, tabs:[{id, label, children[]}] }
  spacer { size?("xs"|"sm"|"md"|"lg") }
  divider { orientation?("horizontal"|"vertical") }
  toolbar { gap?, children[] }

CONTENT NODES:
  heading { text, level?(1-4) }
  text { text }
  image { src, alt?, width?, height?, fit?("cover"|"contain"|"fill"|"none"), radius?("none"|"sm"|"md"|"lg"|"full"), caption?, source? }
  metric { label, value, unit?, confidence?("real"|"simulated"|"estimated") }
  alert { title?, message, tone("info"|"success"|"warning"|"danger") }
  code_block { language?, code }
  table { columns[], rows[][] }

INTERACTIVE NODES:
  button { label, intent, variant?("primary"|"secondary"|"ghost"|"danger"), interaction?{ mode, commitOn?[], includeLocalStateOnCommit? }, localAction? }
  text_input { label?, placeholder?, value?, binding, interaction? }
  number_input { label?, placeholder?, value?, unit?, min?, max?, step?, binding, interaction? }
  textarea { label?, placeholder?, value?, binding, interaction? }
  select { label?, value?, binding, options:[{label,value}], interaction? }
  checkbox { label, checked, binding, interaction? }
  slider { label?, value, min, max, step?, unit?, binding, interaction? }
  stepper { label?, value, binding, min?, max?, step?, unit?, interaction? }

EXTENDED NODES (v0.3.1):
  card { title?, subtitle?, image?, footer?:[], gap?, children[] }
  statistic { title, value, prefix?, suffix?, trend?("up"|"down"|"stable"), trendValue?, description? }
  kpi_card { title, value, unit?, trend?, trendValue?, description?, tone? }
  stat_group { gap?, columns?, items:[{id,label,value,unit?,trend?,trendValue?}] }
  progress { label?, value, max?, unit?, tone? }
  timeline { items:[{id,title,description?,timestamp?,tone?,icon?}] }
  list { ordered?, gap?, items:[{id,text,description?,icon?,tone?}] }
  accordion { defaultOpenIndex?, gap?, items:[{id,title,children[]}] }
  carousel { title?, gap?, visibleItems?, children[] }
  breadcrumb { items:[{label,href?}], separator? }
  badge { text, variant?("default"|"primary"|"success"|"warning"|"danger"|"info"), size? }
  tag { text, variant?, removable?, size? }
  quote { text, author?, source?, tone? }
  description_list { gap?, layout?, items:[{id,term,description}] }
  empty_state { icon?, title, description?, action? }
  steps { current, direction?, items:[{id,title,description?,status?}] }
  gauge { title?, value, min, max, unit?, thresholds?[], size? }
  heatmap { title?, xLabels?, yLabels?, data[][], colorScale?, cellSize? }
  radar_chart { title?, axes[], series:[{name,values[],color?}], maxValue? }
  color_swatch { title?, colors:[{value,label?}], size? }
  clock { format?("time"|"date"|"datetime"|"iso"), timezone?, interval?, label?, variant?("default"|"mono"|"large") }
  timer_refresh { seconds(number, 1-300, default 3), message?(string), showProgress?(boolean) }

=== REVIEW CRITERIA ===

You MUST perform THREE reviews on the new UI. For each issue found, FIX it directly in the output JSON.

━━━ REVIEW 1: FUNCTIONAL AUDIT ━━━

Check EVERY interactive element:
  1. Every "button" MUST have an "intent" field (describing what it does). If missing, add a plausible intent based on the label and context.
  2. Every "button" with intent="ai_transition" mode MUST have an "interaction" object with mode and commitOn. If missing, add:
     interaction: { mode: "ai_transition", commitOn: ["click"] }
  3. Every "button" MUST have a "variant" field. If missing, default to "primary" for main actions, "secondary" for less important ones.
  4. Every input node ("text_input", "number_input", "textarea", "select", "checkbox", "slider", "stepper") MUST have a "binding" field. If missing, add one based on the label (e.g., label="Name" → binding="name").
  5. Input nodes SHOULD have "interaction" with default mode="local" unless there's a reason for ai_transition.
  6. Interactive nodes SHOULD have "semanticRole" and "expectedEffect" where it adds clarity.
  7. ALERT: detect buttons whose "label" or "intent" suggests they change page content, but lack interaction policy. Fix them.
  8. ALERT: detect input fields without bindings. Add bindings.
  9. ALERT: detect elements styled as buttons (e.g., text nodes with button-like labels) but typed as non-interactive. Convert or add note.

  10. TIMER REFRESH CHECK (CRITICAL): Scan ALL text content in the UI tree (text nodes, alert messages, heading text, description_list items, card titles/subtitles, etc.) for loading/thinking indicators. The following patterns indicate a loading state:
     - "AI 正在思考" / "AI is thinking" / "正在生成" / "Generating"
     - "正在加载" / "Loading" / "加载中" / "Fetching"
     - "AI 正在整理" / "AI 正在搜索" / "正在处理"
     - "请稍候" / "Please wait"
     - Any alert with tone="info" whose message says data is being prepared/fetched/awaited
     If ANY of these patterns are detected, you MUST verify that a "timer_refresh" node exists somewhere in the tree (as a direct or indirect child of the root "screen" node). If NO timer_refresh node is present, you MUST ADD one as the LAST child of the screen node:
     { "id": "auto_refresh", "type": "timer_refresh", "seconds": 3, "message": "正在刷新...", "showProgress": true }
     This is NON-NEGOTIABLE — loading pages without auto-refresh will permanently display the loading state.

━━━ REVIEW 2: LAYOUT OPTIMIZATION ━━━

  1. HEADING HIERARCHY: Ensure heading levels (h1→h4) form a proper hierarchy. No h1 after h3 without h2. First heading on screen should typically be h1 or h2.
  2. SPACING BALANCE: Check that the layout doesn't have:
     - Overcrowded sections (too many elements without spacers/dividers)
     - Excessive whitespace (large gaps with little content)
     - Orphaned elements (single child in a large container without purpose)
  3. VISUAL RHYTHM: Alternate between text-heavy and visual elements. Don't stack 5 text blocks in a row.
  4. GRID USAGE: For 3+ cards/stats at the same level, wrap them in a "grid" with appropriate columns instead of a linear "container".
  5. SPLIT/REGION USAGE: When content has a natural main+sidebar pattern, use "split" or "region" rather than stacked containers.
  6. DENSITY CONSISTENCY: Elements within the same section should have consistent density tokens. Don't mix "compact" and "spacious" in the same panel.
  7. TONE APPROPRIATENESS: Warning tones on informational content, success tones on dangerous operations, etc. are wrong. Fix tone mismatches.
  8. CARD STRUCTURE: Cards should have at least 2 of: {title, children, footer, image}. Empty cards or cards with only one text element should be converted to simpler types.
  9. OVER-NESTING: More than 4 levels of container nesting is usually unnecessary. Flatten where possible.
  10. RESPONSIVE HINTS: Add "layout" hints (width/height/align) to containers when it improves the structure.

━━━ REVIEW 3: POSITIONAL STABILITY ━━━

When a PREVIOUS UI is provided, compare it with the NEW UI:
  1. IDENTITY: Elements with the SAME "id" in both UIs represent the same logical component.
  2. SAME ELEMENTS, SAME POSITIONS: If an element existed in the previous UI and still exists in the new UI, keep it at approximately the same position in the tree (same parent, similar sibling order).
  3. DON'T MOVE STABLE ELEMENTS: A heading or a KPI card that was top-left should stay top-left unless there's a clear reason to move it.
  4. REMOVAL IS OK IF JUSTIFIED: If the previous UI had an element that the new UI removed, that's fine — if the element is truly no longer needed.
  5. ADDITIONS GO AT NATURAL POSITIONS: New elements should be added at logical positions (new metrics at top, new details at bottom, new actions in toolbar).
  6. REORDERING: Only reorder children if the new order clearly improves information flow or matches a design pattern better than the previous order.
  7. PRESERVE USER DATA: If the previous UI had input values or selections, the new UI should preserve those bindings and their values.

=== OUTPUT FORMAT ===

You MUST output ONLY a valid JSON object representing the FULL corrected UI tree.
The output must start with '{' and end with '}'.
Do NOT wrap in markdown code fences (\`\`\`json).
Do NOT include any explanatory text outside the JSON.
The output must be parseable by JSON.parse().

The output object should be the complete corrected UI node tree (the value that goes in the "ui" field of the state).
It MUST have "id" and "type" fields at the top level.

Additionally, include a "_review" field at the TOP LEVEL of the output with:
  "_review": {
    "changes": ["change description 1", "change description 2", ...],
    "issuesFound": number,
    "issuesFixed": number
  }

Example output structure:
{
  "id": "screen_main",
  "type": "screen",
  "title": "App Title",
  "children": [ ... ],
  "_review": {
    "changes": ["Added missing intent to button 'btn_calc'", "Fixed heading hierarchy: h3→h2"],
    "issuesFound": 4,
    "issuesFixed": 4
  }
}

=== IMPORTANT RULES ===

1. Be CONSERVATIVE: Only make changes that clearly improve the UI. Don't rewrite the entire layout unless it's fundamentally broken.
2. PRESERVE FUNCTIONALITY: Don't remove interactive elements. Don't change button intents unless they're clearly wrong.
3. PRESERVE DATA: Don't change metric values, chart data, or text content unless they're clearly incorrect.
4. FIX > REPLACE: Prefer fixing individual issues over replacing entire sections.
5. COMPLETE OUTPUT: Output the FULL corrected UI tree, not just the changed parts.
6. VALID JSON: Ensure all strings are properly escaped. No trailing commas. Double-quoted property names.
7. MAX 15 CHANGES: To avoid over-engineering, limit fixes to at most 15 substantive changes per review.`;
}

// -----------------------------------------------------------
// 构建用户提示词（发送给审查 AI 的输入）
// -----------------------------------------------------------

function buildPostProcessPrompt(input: PostProcessInput): string {
  const previousStr = input.previousUI
    ? JSON.stringify(input.previousUI, null, 1)
    : "null (this is the first generation — no previous UI to compare)";

  // 截断过大的 previous UI（保留结构但限制长度）
  const previousTruncated =
    previousStr.length > 8000
      ? previousStr.slice(0, 8000) +
        "\n... [previous UI truncated, length=" +
        previousStr.length +
        "]"
      : previousStr;

  const newStr = JSON.stringify(input.newUI, null, 1);
  const newTruncated =
    newStr.length > 12000
      ? newStr.slice(0, 12000) +
        "\n... [new UI truncated, length=" +
        newStr.length +
        "]"
      : newStr;

  return `=== REVIEW TASK ===
Review the following AI-generated UI and produce a corrected version.

CONTEXT:
  User Query: "${input.userQuery}"
  App Title: ${input.appTitle ?? "N/A"}
  App Kind: ${input.appKind ?? "N/A"}

=== PREVIOUS UI (last round) ===
${previousTruncated}

=== NEW UI (to review) ===
${newTruncated}

=== INSTRUCTIONS ===
1. Perform the THREE reviews described in the system prompt.
2. Fix ALL issues you find directly in the output JSON.
3. Include the "_review" metadata field.
4. Output ONLY the JSON object — no markdown, no explanations outside JSON.
5. The output must start with "{" and end with "}".
6. Be conservative — don't rewrite the entire UI, just fix the issues.`;
}

// -----------------------------------------------------------
// 验证输出是否是可用的 UI 节点
// -----------------------------------------------------------

function isValidUINode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const obj = node as Record<string, unknown>;
  return typeof obj.id === "string" && typeof obj.type === "string";
}

/** 清洗 AI 输出 — 移除 markdown fences、提取 JSON */
function extractJSON(text: string): string {
  // 移除可能的 markdown 代码块
  let cleaned = text.trim();

  // 移除 ```json ... ``` 包裹
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // 尝试找到第一个 { 和最后一个 }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

// -----------------------------------------------------------
// 主函数：AI 后处理 UI 审查
// -----------------------------------------------------------

export async function postProcessUIState(
  input: PostProcessInput,
  modelOverride?: LanguageModelV1,
  pageLogContext?: PageLogContext,
): Promise<PostProcessOutput> {
  const model = modelOverride ?? getModel("disabled"); // 关闭 thinking 提高 JSON 可靠性

  // 基础验证：输入必须有 newUI
  if (!input.newUI || typeof input.newUI !== "object") {
    return {
      correctedUI: input.newUI,
      changes: [],
      ok: false,
      error: "Invalid newUI input",
    };
  }

  const systemPrompt = buildPostProcessSystemPrompt();
  const userPrompt = buildPostProcessPrompt(input);

  console.log(
    "[PostProcess] Starting UI review...",
    `prevUI=${input.previousUI ? "yes" : "no"}, newUI nodes≈${JSON.stringify(input.newUI).length} chars`,
  );

  const startedAt = Date.now();
  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.2, // 低温度确保稳定输出
      maxTokens: 12000,
    });

    const rawText = result.text;
    console.log(`[PostProcess] AI response received: ${rawText.length} chars`);
    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: pageLogContext?.sessionId,
      stage: "post_process",
      status: "success",
      durationMs: Date.now() - startedAt,
      payload: {
        request: {
          system: systemPrompt,
          prompt: userPrompt,
          options: { temperature: 0.2, maxTokens: 12000 },
        },
        response: rawText,
      },
    });

    // 清洗并解析 JSON
    const cleaned = extractJSON(rawText);
    let parsed: unknown;

    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error(
        "[PostProcess] JSON parse failed:",
        (parseErr as Error).message?.slice(0, 100),
      );
      console.error(
        "[PostProcess] Raw output (first 500 chars):",
        rawText.slice(0, 500),
      );
      return {
        correctedUI: input.newUI,
        changes: [],
        ok: false,
        error: `JSON parse failed: ${(parseErr as Error).message?.slice(0, 100)}`,
      };
    }

    // 验证基本结构
    if (!isValidUINode(parsed)) {
      console.error(
        "[PostProcess] Output is not a valid UI node: missing id or type",
      );
      return {
        correctedUI: input.newUI,
        changes: [],
        ok: false,
        error: "Output missing required id/type fields",
      };
    }

    // 提取审查元数据
    const reviewMeta = (parsed as Record<string, unknown>)._review as
      | { changes?: string[]; issuesFound?: number; issuesFixed?: number }
      | undefined;

    // 移除 _review 字段（不是标准 UINode 属性）
    delete (parsed as Record<string, unknown>)._review;

    const changes = reviewMeta?.changes ?? [];
    const issuesFound = reviewMeta?.issuesFound ?? 0;
    const issuesFixed = reviewMeta?.issuesFixed ?? 0;

    console.log(
      `[PostProcess] Review complete: ${issuesFound} issues found, ${issuesFixed} fixed`,
    );
    if (changes.length > 0) {
      console.log("[PostProcess] Changes:", changes.join("; "));
    }

    return {
      correctedUI: parsed as UINode,
      changes,
      ok: true,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[PostProcess] AI call failed:", errMsg.slice(0, 200));
    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: pageLogContext?.sessionId,
      stage: "post_process",
      status: "failure",
      durationMs: Date.now() - startedAt,
      payload: {
        request: {
          system: systemPrompt,
          prompt: userPrompt,
          options: { temperature: 0.2, maxTokens: 12000 },
        },
        error: errMsg,
      },
    });
    return {
      correctedUI: input.newUI,
      changes: [],
      ok: false,
      error: `Post-process AI call failed: ${errMsg.slice(0, 200)}`,
    };
  }
}
