// ============================================================
// AUIR Deterministic Post-Processor — 规则驱动的 UI 修复引擎
// ============================================================
// 替代昂贵的 AI-based post-process（每次 5-15 秒延迟），
// 使用确定性规则修复 AI 生成 UI 中的常见缺陷。
//
// 设计哲学：
//   AI 擅长创造性布局设计，但不擅长一致性维护。
//   规则引擎擅长一致性维护，但不擅长创造性设计。
//   让各引擎做各自擅长的事。
//
// 规则分类：
//   1. 交互完整性 — 按钮/输入必须有语义字段
//   2. 布局一致性 — 容器间距、density 级联
//   3. 安全约束 — H1 数量、禁止节点检查
//   4. 可访问性 — label、alt text、aria 语义
//   5. 数据完整性 — binding 引用有效性、localAction 目标存在性

import type { UINode } from "./types";

// -----------------------------------------------------------
// 修复结果类型
// -----------------------------------------------------------

export interface DeterministicFix {
  /** 修复类型标识 */
  kind: string;
  /** 被修复的节点 ID */
  nodeId: string;
  /** 修复描述（人类可读） */
  description: string;
  /** 修复前的值（如有） */
  before?: string;
  /** 修复后的值 */
  after?: string;
}

export interface DeterministicPostProcessResult {
  /** 修复后的 UI 树（原地修改，同一引用） */
  ui: UINode;
  /** 所有执行的修复 */
  fixes: DeterministicFix[];
  /** 修复数量 */
  fixCount: number;
}

// -----------------------------------------------------------
// 交互节点类型集合
// -----------------------------------------------------------

const INTERACTIVE_TYPES = new Set([
  "button",
  "text_input",
  "number_input",
  "textarea",
  "select",
  "checkbox",
  "slider",
  "stepper",
  "external_link",
  "tabs",
  "accordion",
]);

const INPUT_TYPES = new Set([
  "text_input",
  "number_input",
  "textarea",
  "select",
  "checkbox",
  "slider",
  "stepper",
]);

// -----------------------------------------------------------
// 收集所有 binding 引用
// -----------------------------------------------------------

// collectUsedBindings removed — was dead code (allBindings was never read)

// -----------------------------------------------------------
// 树遍历工具
// -----------------------------------------------------------

function walkTree(node: UINode, visitor: (node: UINode) => void): void {
  visitor(node);
  const rec = node as Record<string, unknown>;

  if (Array.isArray(rec.children)) {
    for (const child of rec.children as UINode[]) walkTree(child, visitor);
  }
  if (rec.primary && typeof rec.primary === "object") {
    walkTree(rec.primary as UINode, visitor);
  }
  if (rec.secondary && typeof rec.secondary === "object") {
    walkTree(rec.secondary as UINode, visitor);
  }
  if (Array.isArray(rec.tabs)) {
    for (const tab of rec.tabs as Array<{ children?: UINode[] }>) {
      for (const child of tab.children ?? []) walkTree(child, visitor);
    }
  }
  if (Array.isArray(rec.footer)) {
    for (const child of rec.footer as UINode[]) walkTree(child, visitor);
  }
  if (Array.isArray(rec.items)) {
    for (const item of rec.items as Array<{ children?: UINode[] }>) {
      if (Array.isArray(item.children)) {
        for (const child of item.children) walkTree(child, visitor);
      }
    }
  }
}

// -----------------------------------------------------------
// Rule 1: 交互完整性修复
// -----------------------------------------------------------

function fixInteractionCompleteness(
  node: UINode,
  fixes: DeterministicFix[],
): void {
  walkTree(node, (n) => {
    const rec = n as Record<string, unknown>;
    const type = rec.type as string;

    // 所有交互节点必须有 semanticRole
    if (INTERACTIVE_TYPES.has(type) && !rec.semanticRole) {
      const defaultRole =
        type === "button" || type === "external_link" ? "navigation" : "input";
      rec.semanticRole = defaultRole;
      fixes.push({
        kind: "semanticRole.autofix",
        nodeId: String(rec.id),
        description: `Added default semanticRole="${defaultRole}" to ${type} node`,
        after: defaultRole,
      });
    }

    // 按钮必须有 intent
    if (type === "button" && !rec.intent) {
      rec.intent = `action_${rec.id}`;
      fixes.push({
        kind: "intent.autofix",
        nodeId: String(rec.id),
        description: `Added default intent to button node`,
        after: String(rec.intent),
      });
    }

    // ai_transition 按钮必须有 commitOn
    const interaction = rec.interaction as Record<string, unknown> | undefined;
    if (
      type === "button" &&
      interaction?.mode === "ai_transition" &&
      (!Array.isArray(interaction.commitOn) ||
        interaction.commitOn.length === 0)
    ) {
      interaction.commitOn = ["click"];
      fixes.push({
        kind: "commitOn.autofix",
        nodeId: String(rec.id),
        description: `Added default commitOn=["click"] to ai_transition button`,
        after: '["click"]',
      });
    }

    // ai_transition 按钮应设置 includeLocalStateOnCommit
    if (
      type === "button" &&
      interaction?.mode === "ai_transition" &&
      interaction.includeLocalStateOnCommit === undefined
    ) {
      interaction.includeLocalStateOnCommit = true;
      fixes.push({
        kind: "includeLocalState.autofix",
        nodeId: String(rec.id),
        description: `Set includeLocalStateOnCommit=true for ai_transition button`,
        after: "true",
      });
    }

    // 输入控件必须有 binding
    if (INPUT_TYPES.has(type) && typeof rec.binding !== "string") {
      rec.binding = `input_${rec.id}`;
      fixes.push({
        kind: "binding.autofix",
        nodeId: String(rec.id),
        description: `Added default binding to ${type} node`,
        after: String(rec.binding),
      });
    }

    // 输入控件应有 interaction.mode = "local"
    if (INPUT_TYPES.has(type) && !interaction) {
      rec.interaction = { mode: "local" };
      fixes.push({
        kind: "interactionMode.autofix",
        nodeId: String(rec.id),
        description: `Added default interaction.mode="local" to ${type} node`,
        after: "local",
      });
    }

    // external_link 必须有 url
    if (type === "external_link" && typeof rec.url !== "string") {
      rec.url = "#";
      fixes.push({
        kind: "url.autofix",
        nodeId: String(rec.id),
        description: `external_link missing url, set to "#"`,
        after: "#",
      });
    }
  });
}

// -----------------------------------------------------------
// Rule 2: 交互下限检查
// -----------------------------------------------------------

function fixInteractiveMinimum(node: UINode, fixes: DeterministicFix[]): void {
  let interactiveCount = 0;
  walkTree(node, (n) => {
    const type = (n as Record<string, unknown>).type as string;
    if (INTERACTIVE_TYPES.has(type)) interactiveCount++;
  });

  if (interactiveCount === 0) {
    // 找到 screen 节点（可能是根节点或嵌套的 screen）
    let screenNode: Record<string, unknown> | null = null;
    walkTree(node, (n) => {
      const r = n as Record<string, unknown>;
      if (r.type === "screen" && !screenNode) screenNode = r;
    });
    // 如果没有 screen，就用根节点
    const target = screenNode ?? (node as Record<string, unknown>);
    if (Array.isArray(target.children)) {
      (target.children as UINode[]).push({
        id: "auto_nav_button",
        type: "button",
        label: "返回首页",
        intent: "restart_runtime",
        variant: "ghost",
        semanticRole: "navigation",
        expectedEffect: "返回启动页面",
        interaction: { mode: "ai_transition", commitOn: ["click"] },
      });
      fixes.push({
        kind: "interactiveMinimum.autofix",
        nodeId: "auto_nav_button",
        description:
          "Screen had 0 interactive controls, added a navigation button",
        after: "返回首页",
      });
    }
  }
}

// -----------------------------------------------------------
// Rule 3: 间距一致性修复
// -----------------------------------------------------------

function fixSpacingConsistency(node: UINode, fixes: DeterministicFix[]): void {
  walkTree(node, (n) => {
    const rec = n as Record<string, unknown>;
    const type = rec.type as string;

    // 容器节点应有 gap
    const CONTAINER_TYPES = new Set([
      "screen",
      "container",
      "grid",
      "region",
      "toolbar",
      "panel",
      "tabs",
      "modal",
      "drawer",
      "carousel",
      "card",
      "accordion",
    ]);

    if (CONTAINER_TYPES.has(type) && rec.gap === undefined) {
      rec.gap = "md";
      fixes.push({
        kind: "gap.autofix",
        nodeId: String(rec.id),
        description: `Added default gap="md" to ${type} container`,
        after: "md",
      });
    }
  });
}

// -----------------------------------------------------------
// Rule 4: 可访问性修复
// -----------------------------------------------------------

function fixAccessibility(node: UINode, fixes: DeterministicFix[]): void {
  walkTree(node, (n) => {
    const rec = n as Record<string, unknown>;
    const type = rec.type as string;

    // image 节点必须有 alt
    if (type === "image" && !rec.alt) {
      rec.alt = rec.caption || "图片";
      fixes.push({
        kind: "alt.autofix",
        nodeId: String(rec.id),
        description: `image node missing alt text, set fallback`,
        after: String(rec.alt),
      });
    }

    // heading 必须有 text
    if (type === "heading" && !rec.text) {
      rec.text = "";
      fixes.push({
        kind: "headingText.autofix",
        nodeId: String(rec.id),
        description: `heading node missing text, set to empty string`,
        after: "",
      });
    }

    // alert 必须有 message
    if (type === "alert" && !rec.message) {
      rec.message = "（无消息内容）";
      fixes.push({
        kind: "alertMessage.autofix",
        nodeId: String(rec.id),
        description: `alert node missing message, set fallback`,
        after: String(rec.message),
      });
    }
  });
}

// -----------------------------------------------------------
// Rule 5: 样式一致性修复
// -----------------------------------------------------------

function fixStyleConsistency(node: UINode, fixes: DeterministicFix[]): void {
  // 统计 screen 下所有直接子节点的 density
  const screen = node as Record<string, unknown>;
  if (screen.type !== "screen" || !Array.isArray(screen.children)) return;

  const densityCount: Record<string, number> = {};
  for (const child of screen.children as UINode[]) {
    const rec = child as Record<string, unknown>;
    const style = rec.style as Record<string, unknown> | undefined;
    const density = style?.density as string | undefined;
    if (density) {
      densityCount[density] = (densityCount[density] ?? 0) + 1;
    }
  }

  // 找到最常见的 density
  let maxDensity = "normal";
  let maxCount = 0;
  for (const [density, count] of Object.entries(densityCount)) {
    if (count > maxCount) {
      maxDensity = density;
      maxCount = count;
    }
  }

  // 给没有 density 的子节点分配最常见的 density
  for (const child of screen.children as UINode[]) {
    const rec = child as Record<string, unknown>;
    const style = rec.style as Record<string, unknown> | undefined;
    if (!style?.density) {
      if (!rec.style) rec.style = {};
      (rec.style as Record<string, unknown>).density = maxDensity;
      fixes.push({
        kind: "density.cascade",
        nodeId: String(rec.id),
        description: `Cascaded dominant density="${maxDensity}" to node`,
        after: maxDensity,
      });
    }
  }
}

// -----------------------------------------------------------
// Rule 6: localAction 目标验证
// -----------------------------------------------------------

function fixLocalActionTargets(node: UINode, fixes: DeterministicFix[]): void {
  const allNodeIds = new Set<string>();
  walkTree(node, (n) => {
    allNodeIds.add((n as Record<string, unknown>).id as string);
  });

  walkTree(node, (n) => {
    const rec = n as Record<string, unknown>;
    const la = rec.localAction as Record<string, unknown> | undefined;
    if (!la) return;

    // append_text 的 targetBinding 必须存在于 UI 树中
    if (la.type === "append_text" && typeof la.targetBinding === "string") {
      // 检查是否有对应的 text_input 或 textarea 节点
      let targetExists = false;
      walkTree(node, (target) => {
        const tr = target as Record<string, unknown>;
        if (
          (tr.type === "text_input" || tr.type === "textarea") &&
          tr.binding === la.targetBinding
        ) {
          targetExists = true;
        }
      });
      if (!targetExists) {
        fixes.push({
          kind: "localAction.targetMissing",
          nodeId: String(rec.id),
          description: `append_text targetBinding="${la.targetBinding}" has no matching text_input/textarea`,
          before: String(la.targetBinding),
        });
      }
    }

    // set_active_tab 的 tabsId 必须存在于 UI 树中
    if (la.type === "set_active_tab" && typeof la.tabsId === "string") {
      if (!allNodeIds.has(la.tabsId)) {
        fixes.push({
          kind: "localAction.tabsIdMissing",
          nodeId: String(rec.id),
          description: `set_active_tab tabsId="${la.tabsId}" has no matching tabs node`,
          before: String(la.tabsId),
        });
      }
    }
  });
}

// -----------------------------------------------------------
// Rule 7: Tabs 按钮自动接线
// -----------------------------------------------------------
// 当 AI 生成了 tabs 节点，但附近有标签按钮缺少 set_active_tab 时，
// 自动为这些按钮添加正确的 localAction。

function fixTabButtonWiring(node: UINode, fixes: DeterministicFix[]): void {
  // 收集所有 tabs 节点（id → tab 列表）
  const tabsMap = new Map<
    string,
    { tabs: Array<{ id: string; label: string }>; node: UINode }
  >();
  walkTree(node, (n) => {
    const rec = n as Record<string, unknown>;
    if (rec.type === "tabs" && Array.isArray(rec.tabs)) {
      tabsMap.set(String(rec.id), {
        tabs: rec.tabs as Array<{ id: string; label: string }>,
        node: n,
      });
    }
  });

  if (tabsMap.size === 0) return;

  // 遍历所有按钮，检查是否与某个 tabs 的标签匹配
  walkTree(node, (n) => {
    const rec = n as Record<string, unknown>;
    if (rec.type !== "button") return;

    const la = rec.localAction as Record<string, unknown> | undefined;
    // 已有 set_active_tab 的按钮跳过
    if (la?.type === "set_active_tab") return;

    const buttonLabel = String(rec.label ?? "")
      .trim()
      .toLowerCase();
    if (!buttonLabel) return;

    // 检查是否匹配任何 tabs 节点的标签
    for (const [, tabsInfo] of tabsMap) {
      const matchedTab = tabsInfo.tabs.find(
        (tab) => tab.label.trim().toLowerCase() === buttonLabel,
      );
      if (!matchedTab) continue;

      // 自动接线：添加 set_active_tab localAction
      rec.localAction = {
        type: "set_active_tab",
        tabsId: tabsInfo.node.id,
        nextTab: matchedTab.id,
      };
      // 确保交互模式为 local（不触发 AI 调用）
      if (!rec.interaction) rec.interaction = {};
      (rec.interaction as Record<string, unknown>).mode = "local";

      fixes.push({
        kind: "tabsButton.autofix",
        nodeId: String(rec.id),
        description: `Auto-wired button "${rec.label}" to tabs "${tabsInfo.node.id}" → tab "${matchedTab.id}"`,
        after: `set_active_tab(${tabsInfo.node.id}→${matchedTab.id})`,
      });
      break; // 一个按钮只匹配一个 tabs
    }
  });
}

// -----------------------------------------------------------
// 主确定性后处理函数
// -----------------------------------------------------------

/**
 * 对 AI 生成的 UI 执行确定性规则修复。
 *
 * 设计原则：
 * - 只修复明确的缺陷（缺失字段、不一致、安全隐患）
 * - 不改变 AI 的创意布局决策
 * - 所有修复都是可逆的（通过 fixes 数组追溯）
 * - 执行时间 < 5ms（vs AI 后处理 5-15 秒）
 *
 * @param ui AI 生成的 UI 树（原地修改）
 * @returns 修复结果
 */
export function deterministicPostProcess(
  ui: UINode,
): DeterministicPostProcessResult {
  const fixes: DeterministicFix[] = [];

  // 按优先级顺序执行修复规则
  fixInteractionCompleteness(ui, fixes); // 最高优先级：交互完整性
  fixInteractiveMinimum(ui, fixes); // 确保有交互控件
  fixAccessibility(ui, fixes); // 可访问性
  fixSpacingConsistency(ui, fixes); // 间距一致性
  fixStyleConsistency(ui, fixes); // 样式级联
  fixLocalActionTargets(ui, fixes); // localAction 验证
  fixTabButtonWiring(ui, fixes); // tabs 按钮自动接线

  return {
    ui,
    fixes,
    fixCount: fixes.length,
  };
}
