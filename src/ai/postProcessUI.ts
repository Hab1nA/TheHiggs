// ============================================================
// AI Post-Process Mode — 两步 UI 审查与修正
// ============================================================
// 当用户开启 Post-Process Mode 时，在 AI 生成新 UI 后，
// 分两步调用 AI 进行审查：
//   Step 1: Visual Polish / Layout Consistency
//     - 首次生成 (previousUI=null): 综合美化排版（6 维度设计审查）
//     - 后续生成 (previousUI 存在): 布局/风格一致性调整
//   Step 2: Functionality Audit
//     - 交互元素语义-功能匹配检查，确保按钮可点击、输入有绑定等
//
// 架构：独立于主生成管线的后处理步骤
//   generateNextAUIRState → polishOrConsistencyReview → functionalityReview → 返回修正后 UI
// ============================================================

import type { UINode } from "@/auir/types";
import { appendRuntimeLog } from "@/runtime/logging/server";
import type { PageLogContext } from "@/runtime/logging/types";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./model";

// -----------------------------------------------------------
// 共享类型
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
// Zod Schema — 后处理输出（UI 树 + _review 元数据）
// -----------------------------------------------------------

/** 后处理输出 schema：UI 树 + _review 元数据字段 */
const postProcessOutputSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    _review: z
      .object({
        changes: z
          .array(z.string())
          .describe("List of changes made during review"),
        issuesFound: z.number().describe("Total issues found"),
        issuesFixed: z.number().describe("Total issues fixed"),
      })
      .describe("Review metadata (required by prompt instructions)"),
  })
  .passthrough();

// -----------------------------------------------------------
// 共享工具函数
// -----------------------------------------------------------

/**
 * 通用 AI 调用 + JSON 解析 + _review 元数据提取。
 * 两步共用此逻辑，避免重复代码。
 * 使用 generateObject + mode: "json" 确保可靠 JSON 输出。
 */
async function runReviewAI(
  systemPrompt: string,
  userPrompt: string,
  input: PostProcessInput,
  stage: "visual_polish" | "consistency_review" | "functionality_review",
  maxTokens: number,
  pageLogContext?: PageLogContext,
): Promise<PostProcessOutput> {
  const model = getModel("disabled"); // 关闭 thinking 提高 JSON 可靠性

  if (!input.newUI || typeof input.newUI !== "object") {
    return {
      correctedUI: input.newUI,
      changes: [],
      ok: false,
      error: "Invalid newUI input",
    };
  }

  console.log(
    `[PostProcess:${stage}] Starting review...`,
    `prevUI=${input.previousUI ? "yes" : "no"}, newUI≈${JSON.stringify(input.newUI).length} chars`,
  );

  const startedAt = Date.now();
  try {
    // 使用 generateObject + mode: "json" 确保可靠 JSON 输出
    const result = await generateObject({
      model,
      schema: postProcessOutputSchema,
      system: systemPrompt,
      prompt: userPrompt,
      mode: "json",
      temperature: 0.2,
      maxTokens,
    });

    const parsed = result.object;
    console.log(`[PostProcess:${stage}] AI response received (JSON mode)`);
    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: pageLogContext?.sessionId,
      stage,
      status: "success",
      durationMs: Date.now() - startedAt,
      payload: {
        request: {
          system: systemPrompt,
          prompt: userPrompt,
          options: { mode: "json", temperature: 0.2, maxTokens },
        },
        response: JSON.stringify(parsed).slice(0, 2000), // 截断避免日志过大
      },
    });

    // 提取 _review 元数据
    const parsedObj = parsed as Record<string, unknown>;
    const reviewMeta = parsedObj._review as
      | { changes?: string[]; issuesFound?: number; issuesFixed?: number }
      | undefined;
    delete parsedObj._review;

    const changes = reviewMeta?.changes ?? [];
    const issuesFound = reviewMeta?.issuesFound ?? 0;
    const issuesFixed = reviewMeta?.issuesFixed ?? 0;

    console.log(
      `[PostProcess:${stage}] Done: ${issuesFound} found, ${issuesFixed} fixed`,
    );
    if (changes.length > 0) {
      console.log(`[PostProcess:${stage}] Changes:`, changes.join("; "));
    }

    return { correctedUI: parsedObj as unknown as UINode, changes, ok: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[PostProcess:${stage}] AI call failed:`,
      errMsg.slice(0, 200),
    );
    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: pageLogContext?.sessionId,
      stage,
      status: "failure",
      durationMs: Date.now() - startedAt,
      payload: {
        request: {
          system: systemPrompt,
          prompt: userPrompt,
          options: { temperature: 0.2, maxTokens },
        },
        error: errMsg,
      },
    });
    return {
      correctedUI: input.newUI,
      changes: [],
      ok: false,
      error: `${stage} AI call failed: ${errMsg.slice(0, 200)}`,
    };
  }
}

// ============================================================
// 共享组件参考（三个 prompt 共用，避免重复）
// ============================================================

const COMPONENT_REFERENCE = `=== COMPONENT REFERENCE (key types only) ===

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
  timer_refresh { seconds(number, 1-300, default 3), message?(string), showProgress?(boolean) }`;

const OUTPUT_FORMAT_INSTRUCTIONS = `=== OUTPUT FORMAT ===

You MUST output ONLY a valid JSON object representing the FULL corrected UI tree.
The output must start with '{' and end with '}'.
Do NOT wrap in markdown code fences.
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

Example:
{
  "id": "screen_main",
  "type": "screen",
  "title": "App Title",
  "children": [ ... ],
  "_review": {
    "changes": ["Wrapped 3 KPI cards in grid(columns=3)", "Added gap='md' to main panel"],
    "issuesFound": 4,
    "issuesFixed": 4
  }
}`;

// ============================================================
// Step 1a: Visual Polish Prompt（首次生成，previousUI = null）
// ============================================================

function buildVisualPolishSystemPrompt(): string {
  return `You are the Visual Polish Engine — a UI design-review AI for an AI-UI co-execution system.

Your role is to review a FIRST-TIME generated UI and improve its visual layout quality.
This is the FIRST generation — there is no previous UI to compare against.
Your job is purely about making the layout look clean, aligned, and professional.

${COMPONENT_REFERENCE}

=== YOUR MISSION: 6-DIMENSION VISUAL REVIEW ===

You MUST perform ALL 6 reviews. For each issue found, FIX it directly in the output JSON.
You MAY add STRUCTURAL nodes (container, grid, panel, region, split, spacer, divider, tabs, toolbar, card as layout wrapper) to improve layout.
You MUST NOT add FUNCTIONAL nodes (button, text_input, number_input, textarea, select, checkbox, slider, stepper).
You MUST NOT modify any node's "id", "type", text content, metric values, or alert messages.
You MUST NOT modify any node's "intent", "binding", "interaction", "localAction", or "variant" fields.

━━━ REVIEW 1: ALIGNMENT & GRID CONSISTENCY ━━━

  1. SIBLING ALIGNMENT: Sibling nodes at the same level should use consistent layout methods.
     If a panel has 3 cards side by side, they MUST be inside a grid(columns=3) or container(direction="row"),
     NOT scattered as loose children of a column container.
  2. PARALLEL DISPLAY: Elements meant to be viewed side-by-side (KPI cards, statistics, comparison items)
     MUST use grid or container(direction="row"). They MUST NOT rely on default column stacking.
  3. FORM ALIGNMENT: Form elements (input + label pairs) in the same area should use
     container(direction="column") to maintain vertical alignment.
  4. ACTION BUTTONS: Horizontal groups of action buttons should be wrapped in container(direction="row") or toolbar.
  5. SPLIT RATIO: When using split, the primary content area should be ≥60% and sidebar ≤40%.
     Good ratios: "2:1", "3:1". Avoid "1:1" unless content is truly balanced.

━━━ REVIEW 2: SPACING & BREATHING ROOM ━━━

  1. GAP COVERAGE: Every container (container, grid, panel, region) MUST have a reasonable gap value:
     - Compact areas (toolbars, inline form rows) → gap="xs" or gap="sm"
     - Normal content areas → gap="md"
     - Spacious display areas (dashboards, hero sections) → gap="lg"
  2. SECTION SEPARATION: Adjacent visual sections should have a divider or spacer between them.
  3. CONSECUTIVE ELEMENTS: 3+ consecutive leaf nodes of the same kind (e.g., 5 text nodes in a row)
     should be grouped into a card/panel, or have dividers inserted between logical groups.
  4. ORPHAN CHECK: A single element alone in a large container (surrounded by empty space)
     should either be given siblings or the container should be removed/simplified.

━━━ REVIEW 3: VISUAL HIERARCHY ━━━

  1. PAGE TITLE: The first content element under "screen" should be a heading(level=1 or 2)
     serving as the page title. If missing, add one based on the app context.
  2. HEADING LEVEL PROGRESSION: Heading levels must progress sequentially.
     h1 → h2 → h3 is OK. h1 → h3 (skipping h2) is NOT OK — fix by inserting intermediate heading or adjusting levels.
  3. EMPHASIS HIERARCHY: Important information should use style.emphasis="high".
     Auxiliary/supporting information should use style.emphasis="low" or style.tone="muted".
  4. ALERT USAGE: Warning/error content MUST use alert(tone="warning"/"danger"), not plain text nodes.
  5. METRIC OVER TEXT: Numerical data (prices, counts, percentages) should use metric or statistic nodes,
     not plain text nodes with numbers in them.

━━━ REVIEW 4: STYLE CONSISTENCY ━━━

  1. DENSITY UNIFORMITY: Elements within the same panel/region should share the same density value.
     Do NOT mix "compact" and "spacious" density within a single section.
  2. TONE UNIFORMITY: Same-status elements should share tones:
     - All success states → tone="success"
     - All warning states → tone="warning"
     - All primary action buttons → variant="primary"
     - All secondary actions → variant="secondary"
  3. HEADING LEVEL UNIFORMITY: Sibling panels at the same hierarchy level should use the same heading level.
     If Panel A uses h2, Panel B at the same level should also use h2 (not h3).
  4. IMAGE RADIUS: Images at the same level should use consistent radius values.
     If card images use radius="md", don't have one card with radius="none" and another with radius="lg".

━━━ REVIEW 5: LAYOUT PATTERN APPROPRIATENESS ━━━

  Match the layout to the content type:
  - DASHBOARD (multiple KPIs/metrics) → Use grid as the main layout, NOT single-column stacking.
  - TOOL (input + results) → Use split(horizontal): left panel for inputs, right panel for results.
  - CONTENT DISPLAY (encyclopedia/articles) → Use region(header/main), with card grouping in main area.
  - LIST/SEARCH RESULTS → Use list component, or container with card-wrapped items.
  - FORM/SETTINGS → Use panel wrapper with container(direction="column") for field layout.

━━━ REVIEW 6: STRUCTURAL CLEANLINESS ━━━

  1. NESTING DEPTH: No more than 5 levels of container nesting. Flatten if deeper.
  2. EMPTY CONTAINERS: container/grid/panel with children=[] should be REMOVED.
  3. SINGLE-CHILD CONTAINERS: A container with only 1 child (that isn't split/region) is redundant.
     Remove the container and use the child directly, or add meaningful siblings.
  4. TABS INTEGRITY: Each tab in a tabs node should have at least 1 meaningful child.
  5. REGION SEMANTICS: region nodes should use semantically correct values:
     "header", "sidebar", "main", "footer", "toolbar", "results", "logs", "inspector".

=== CONSERVATION RULES ===

1. PRESERVE CONTENT: Do NOT change text strings, metric values, alert messages, or data.
2. PRESERVE INTERACTIVITY: Do NOT modify intent, binding, interaction, localAction, or variant fields.
3. PRESERVE IDS: Do NOT change any node's "id" or "type".
4. FIX > REWRITE: Prefer targeted fixes over wholesale layout replacement.
5. MAX 30 CHANGES: Limit to at most 30 substantive changes.
6. COMPLETE OUTPUT: Output the FULL corrected UI tree, not a diff.

${OUTPUT_FORMAT_INSTRUCTIONS}`;
}

// ============================================================
// Step 1b: Layout Consistency Prompt（后续生成，previousUI 存在）
// ============================================================

function buildConsistencySystemPrompt(): string {
  return `You are the Layout Consistency Engine — a UI review AI for an AI-UI co-execution system.

Your role is to ensure a NEWLY generated UI maintains visual consistency with the PREVIOUS UI.
You receive both the previous UI tree and the new UI tree.
You produce a CORRECTED version of the new UI that preserves the layout patterns, visual style,
and component positioning of the previous UI — while still carrying the new content.

${COMPONENT_REFERENCE}

=== YOUR MISSION: LAYOUT CONSISTENCY REVIEW ===

You MUST perform ALL 4 consistency checks. For each issue found, FIX it directly in the output JSON.
You MAY add STRUCTURAL nodes (container, grid, panel, region, split, spacer, divider, tabs, toolbar, card as layout wrapper).
You MUST NOT add FUNCTIONAL nodes (button, text_input, number_input, textarea, select, checkbox, slider, stepper).
You MUST NOT modify any node's "id", "type", text content, metric values, or alert messages.
You MUST NOT modify any node's "intent", "binding", "interaction", "localAction", or "variant" fields.

━━━ CHECK 1: ID-BASED POSITION STABILITY ━━━

  1. IDENTITY MATCH: Elements with the SAME "id" in both UIs represent the same logical component.
  2. SAME PARENT, SAME ORDER: If an element existed in the previous UI and still exists in the new UI,
     keep it at approximately the same position in the tree (same parent container, similar sibling order).
  3. DON'T MOVE STABLE ELEMENTS: A heading or KPI card that was top-left should stay top-left
     unless there's a clear reason to move it.
  4. REMOVAL IS OK IF JUSTIFIED: If the previous UI had an element that the new UI removed,
     that's fine — only if the element is truly no longer needed.
  5. ADDITIONS GO AT NATURAL POSITIONS: New elements should be added at logical positions
     (new metrics at top, new details at bottom, new actions in toolbar).
  6. REORDERING: Only reorder children if the new order clearly improves information flow
     or matches a design pattern better than the previous order.

━━━ CHECK 2: LAYOUT MODE INHERITANCE ━━━

  1. LAYOUT PATTERN PERSISTENCE: If the previous UI used split(horizontal) for main content + sidebar,
     the new UI should also use split for the same structural purpose — not switch to stacked containers.
  2. GRID PERSISTENCE: If the previous UI used grid(columns=4) for KPI cards,
     the new UI should use the same grid structure for its KPI cards.
  3. REGION PERSISTENCE: If the previous UI used region("header"/"main"/"sidebar"),
     the new UI should maintain the same region structure.
  4. TAB PERSISTENCE: If the previous UI had tabs with specific tab IDs,
     the new UI should preserve those tab IDs and their ordering.

━━━ CHECK 3: VISUAL STYLE INHERITANCE ━━━

  1. TONE MATCHING: Elements with the same semanticRole should inherit the previous UI's
     style.tone values. E.g., if "display" elements were tone="muted" before, keep them muted.
  2. DENSITY MATCHING: The overall density setting should match the previous UI.
     If the previous UI used density="normal", don't switch to "compact" without reason.
  3. GAP CONSISTENCY: Gap sizes should match the previous UI for equivalent containers.
  4. HEADING LEVEL MATCHING: Heading levels for the same structural sections should be preserved.
     If the page title was h1 before, keep it h1.
  5. IMAGE STYLE MATCHING: Image radius, fit, and size hints should match the previous UI
     for equivalent image slots.

━━━ CHECK 4: USER DATA PRESERVATION ━━━

  1. INPUT VALUES: If the previous UI had input nodes with specific values or bindings,
     the new UI should preserve those bindings and their values.
  2. SELECTION STATE: If the previous UI had a select/checkbox with a specific value,
     the new UI should preserve that selection state.
  3. ACTIVE TAB: If the previous UI had a specific activeTab, the new UI should preserve it.

=== CONSERVATION RULES ===

1. PRESERVE CONTENT: Do NOT change text strings, metric values, alert messages, or data.
2. PRESERVE INTERACTIVITY: Do NOT modify intent, binding, interaction, localAction, or variant fields.
3. PRESERVE IDS: Do NOT change any node's "id" or "type".
4. FIX > REWRITE: Prefer targeted fixes over wholesale layout replacement.
5. MAX 30 CHANGES: Limit to at most 30 consistency fixes.
6. COMPLETE OUTPUT: Output the FULL corrected UI tree, not a diff.

${OUTPUT_FORMAT_INSTRUCTIONS}`;
}

// ============================================================
// Step 2: Functionality Audit Prompt（始终执行）
// ============================================================

function buildFunctionalitySystemPrompt(): string {
  return `You are the Functionality Audit Engine — a UI review AI for an AI-UI co-execution system.

Your role is to review a UI tree and ensure every interactive element has correct,
complete functional properties. You do NOT adjust layout — only fix functional attributes.

${COMPONENT_REFERENCE}

=== YOUR MISSION: FUNCTIONALITY AUDIT ===

You MUST perform ALL 4 checks. For each issue found, FIX it directly in the output JSON.
You MUST NOT rearrange layout, move nodes, add structural containers, or change spacing.
You MAY add the following nodes ONLY when required by the timer_refresh check:
  - timer_refresh node
You MUST NOT add any other new nodes.
You MUST NOT change layout properties (gap, direction, columns, ratio, layout, style.density, style.emphasis).

━━━ CHECK 1: BUTTON COMPLETENESS ━━━

  For EVERY button node in the tree:
  1. "intent" field MUST exist. If missing, add a plausible intent based on label and context.
  2. "variant" field MUST exist. If missing:
     - Main/primary actions (Submit, Calculate, Generate, Search, Apply, Run) → variant="primary"
     - Less important actions (Cancel, Back, Close, Reset) → variant="secondary"
     - Tertiary actions (Learn More, Info, Help) → variant="ghost"
  3. "interaction" field MUST exist for buttons that trigger AI actions:
     - If label/intent suggests AI transition (Search, Generate, Calculate, Analyze, Compare, Apply, Submit, Next, Run):
       interaction: { mode: "ai_transition", commitOn: ["click"], includeLocalStateOnCommit: true }
     - If label/intent suggests local action (Toggle, Switch, Close, Expand):
       interaction: { mode: "local" }
  4. "semanticRole" SHOULD exist. Infer from context:
     - Submit/Apply/Run → semanticRole="analysis_action"
     - Cancel/Close/Back → semanticRole="navigation"
     - Toggle/Adjust → semanticRole="local_adjustment"
  5. "expectedEffect" SHOULD exist. Write a brief description of what happens when clicked.

━━━ CHECK 2: INPUT NODE COMPLETENESS ━━━

  For EVERY input node (text_input, number_input, textarea, select, checkbox, slider, stepper):
  1. "binding" field MUST exist. If missing, derive from label:
     - label="Name" → binding="name"
     label="Email Address" → binding="emailAddress"
     label="搜索关键词" → binding="searchKeyword"
     If no label, use the node's id as binding.
  2. "interaction" field SHOULD exist. Default to:
     interaction: { mode: "local" }
     UNLESS the input clearly triggers AI processing on change.
  3. "semanticRole" SHOULD be "input" for all input nodes.
  4. "expectedEffect" SHOULD describe what the input controls.

━━━ CHECK 3: TIMER REFRESH DETECTION (CRITICAL) ━━━

  Scan ALL text content in the UI tree for loading/thinking indicators:
  - "AI 正在思考" / "AI is thinking" / "正在生成" / "Generating"
  - "正在加载" / "Loading" / "加载中" / "Fetching"
  - "AI 正在整理" / "AI 正在搜索" / "正在处理"
  - "请稍候" / "Please wait"
  - Any alert with tone="info" whose message says data is being prepared/fetched/awaited

  Check text in: text nodes, alert messages, heading text, description_list items,
  card titles/subtitles, badge text, tag text, list item text.

  If ANY of these patterns are detected:
  - Verify a "timer_refresh" node exists as a direct or indirect child of the root "screen" node.
  - If NO timer_refresh node is present, ADD one as the LAST child of the screen node:
    { "id": "auto_refresh", "type": "timer_refresh", "seconds": 3, "message": "正在刷新...", "showProgress": true }

  This is NON-NEGOTIABLE — loading pages without auto-refresh will permanently display the loading state.

━━━ CHECK 4: SEMANTIC-TYPE MATCHING ━━━

  Scan for mismatches between a node's apparent purpose and its type:
  1. Text nodes with button-like labels ("点击这里", "Click here", "查看详情", "Learn more")
     that are NOT buttons → Consider if they should be converted to button nodes.
     Only convert if the text clearly implies a clickable action.
  2. Buttons that display static information (no action intent) → Consider if they should be text or metric.
  3. Alert nodes used for non-alert purposes (purely informational without warning/success tone)
     → Adjust tone to "info" if not already set.

=== CONSERVATION RULES ===

1. PRESERVE LAYOUT: Do NOT rearrange nodes, change containers, add/remove structural nodes, or modify spacing.
2. PRESERVE CONTENT: Do NOT change text strings, metric values, or alert messages.
3. PRESERVE IDS: Do NOT change any node's "id" or "type".
4. FIX > REPLACE: Prefer fixing individual properties over replacing entire nodes.
5. MAX 30 CHANGES: Limit to at most 30 functional fixes.
6. COMPLETE OUTPUT: Output the FULL corrected UI tree, not a diff.

${OUTPUT_FORMAT_INSTRUCTIONS}`;
}

// -----------------------------------------------------------
// 构建用户提示词
// -----------------------------------------------------------

function buildReviewPrompt(
  input: PostProcessInput,
  mode: "visual_polish" | "consistency_review" | "functionality_review",
): string {
  const newStr = JSON.stringify(input.newUI, null, 1);
  const newTruncated =
    newStr.length > 12000
      ? newStr.slice(0, 12000) +
        "\n... [new UI truncated, length=" +
        newStr.length +
        "]"
      : newStr;

  // Visual Polish 和 Functionality 不需要 previousUI
  if (mode === "visual_polish" || mode === "functionality_review") {
    return `=== REVIEW TASK (${mode.toUpperCase()}) ===

CONTEXT:
  User Query: "${input.userQuery}"
  App Title: ${input.appTitle ?? "N/A"}
  App Kind: ${input.appKind ?? "N/A"}

=== UI TO REVIEW ===
${newTruncated}

=== INSTRUCTIONS ===
1. Perform the review described in the system prompt.
2. Fix ALL issues you find directly in the output JSON.
3. Include the "_review" metadata field.
4. Output ONLY the JSON object — no markdown, no explanations outside JSON.
5. The output must start with "{" and end with "}".
6. Be conservative — don't rewrite the entire UI, just fix the issues.`;
  }

  // Consistency review 需要 previousUI
  const previousStr = input.previousUI
    ? JSON.stringify(input.previousUI, null, 1)
    : "null (no previous UI)";
  const previousTruncated =
    previousStr.length > 8000
      ? previousStr.slice(0, 8000) +
        "\n... [previous UI truncated, length=" +
        previousStr.length +
        "]"
      : previousStr;

  return `=== REVIEW TASK (CONSISTENCY REVIEW) ===

CONTEXT:
  User Query: "${input.userQuery}"
  App Title: ${input.appTitle ?? "N/A"}
  App Kind: ${input.appKind ?? "N/A"}

=== PREVIOUS UI (last round) ===
${previousTruncated}

=== NEW UI (to review) ===
${newTruncated}

=== INSTRUCTIONS ===
1. Perform the consistency checks described in the system prompt.
2. Compare the NEW UI against the PREVIOUS UI for layout/style consistency.
3. Fix ALL issues you find directly in the output JSON.
4. Include the "_review" metadata field.
5. Output ONLY the JSON object — no markdown, no explanations outside JSON.
6. The output must start with "{" and end with "}".
7. Be conservative — don't rewrite the entire UI, just fix consistency issues.`;
}

// ============================================================
// Step 1: Visual Polish / Layout Consistency
// ============================================================

/**
 * Step 1: 根据 previousUI 是否为 null 选择不同的审查策略。
 * - previousUI = null → Visual Polish（首次生成，6 维度美化）
 * - previousUI 存在 → Layout Consistency（后续生成，布局一致性）
 */
export async function polishOrConsistencyReview(
  input: PostProcessInput,
  pageLogContext?: PageLogContext,
): Promise<PostProcessOutput> {
  const isFirstGeneration = input.previousUI === null;

  if (isFirstGeneration) {
    console.log("[PostProcess:Step1] Mode: Visual Polish (first generation)");
    return runReviewAI(
      buildVisualPolishSystemPrompt(),
      buildReviewPrompt(input, "visual_polish"),
      input,
      "visual_polish",
      16000, // 首次生成内容量大，需要更多空间
      pageLogContext,
    );
  }

  console.log(
    "[PostProcess:Step1] Mode: Layout Consistency (subsequent generation)",
  );
  return runReviewAI(
    buildConsistencySystemPrompt(),
    buildReviewPrompt(input, "consistency_review"),
    input,
    "consistency_review",
    12000,
    pageLogContext,
  );
}

// ============================================================
// Step 2: Functionality Audit
// ============================================================

/**
 * Step 2: 交互元素语义-功能匹配检查。
 * 仅审查交互属性（intent/binding/interaction/variant），不调整布局。
 */
export async function functionalityReview(
  input: PostProcessInput,
  pageLogContext?: PageLogContext,
): Promise<PostProcessOutput> {
  console.log("[PostProcess:Step2] Mode: Functionality Audit");
  return runReviewAI(
    buildFunctionalitySystemPrompt(),
    buildReviewPrompt(input, "functionality_review"),
    input,
    "functionality_review",
    10000,
    pageLogContext,
  );
}
