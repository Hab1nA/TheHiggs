// ============================================================
// AUIR Layout Beautifier — 自动修复 AI 生成 UI 的排版缺陷
// ============================================================
//
// 在 AI 生成的 UI state 通过 Zod 校验后、渲染前执行。
// 目标：自动补充缺失的间距参数，防止 UI 元素紧贴在一起。
//
// 策略（保守）：
//   1. Density 级联 — 父节点 density 自动继承给子布局节点
//   2. 默认 gap — 容器/面板/网格等若无显式 gap，自动填充合理默认值
//   3. 不修改 AI 显式设置的 "none" — 尊重 AI 的明确意图
//   4. 不修改非布局节点 — 不改变 leaf component 的内容

import type { UINode } from "./types";

// -----------------------------------------------------------
// 布局节点类型（包含 children 的容器类节点）
// -----------------------------------------------------------

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
]);

/** 判断节点是否为布局容器 */
function isContainer(node: UINode): boolean {
  return CONTAINER_TYPES.has(node.type);
}

/** 获取节点的 density */
function getDensity(node: Record<string, unknown>): string | undefined {
  const style = node.style as Record<string, unknown> | undefined;
  return style?.density as string | undefined;
}

/** 设置节点的 density（会创建 style 对象如果不存在） */
function setDensity(node: Record<string, unknown>, density: string): void {
  if (!node.style || typeof node.style !== "object") {
    node.style = {};
  }
  (node.style as Record<string, unknown>).density = density;
}

/** 检查节点是否显式设置了 gap（包括 "none"） */
function hasExplicitGap(node: Record<string, unknown>): boolean {
  return node.gap !== undefined;
}

/** 检查节点是否显式设置了 density */
function hasExplicitDensity(node: Record<string, unknown>): boolean {
  const style = node.style as Record<string, unknown> | undefined;
  return style?.density !== undefined;
}

// -----------------------------------------------------------
// 主美化函数
// -----------------------------------------------------------

export interface BeautifyOptions {
  /** 全局默认 density（当整棵树都没有指定时使用） */
  defaultDensity?: "compact" | "normal" | "spacious";
  /** 全局默认 gap（当容器没有显式 gap 且没有 density 时使用） */
  defaultGap?: "xs" | "sm" | "md" | "lg";
  /** 是否在叶子节点间自动插入 spacer（保守策略，默认 true） */
  autoInsertSpacers?: boolean;
}

const DEFAULT_OPTIONS: Required<BeautifyOptions> = {
  defaultDensity: "normal",
  defaultGap: "md",
  autoInsertSpacers: true,
};

/**
 * 美化 UI 树：补充缺失的 spacing 参数
 * 原地修改 node 树（mutate），返回修改后的根节点
 */
export function beautifyLayout(
  root: UINode,
  options: BeautifyOptions = {},
): UINode {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  walkAndBeautify(
    root as Record<string, unknown>,
    opts.defaultDensity,
    opts.defaultGap,
    opts,
  );
  return root;
}

/**
 * 递归美化节点树
 * @param parentDensity 从父节点继承的 density
 * @param parentGap 从父节点继承的默认 gap size
 */
function walkAndBeautify(
  node: Record<string, unknown>,
  parentDensity: string,
  parentGap: string,
  opts: Required<BeautifyOptions>,
): void {
  if (!node || typeof node !== "object") return;

  // Step 1: Inherit parent density for container nodes
  if (!hasExplicitDensity(node) && isContainer(node as unknown as UINode)) {
    // Only set density if this is a container that would benefit
    // (leaf nodes don't need density set on them)
  }

  // Step 2: Ensure layout containers have gap
  if (isContainer(node as unknown as UINode)) {
    // Ensure density is set (for Renderer to pick up)
    if (!hasExplicitDensity(node)) {
      // Only set density if parent differs from default (to avoid noise)
      // We'll always set it for top-level containers so it cascades properly
      const currentDensity = getDensity(node);
      if (!currentDensity) {
        setDensity(node, parentDensity);
      }
    }

    // Ensure gap is set
    if (!hasExplicitGap(node)) {
      // Use node's own density to determine gap, or fall back to parent default
      const nodeDensity = getDensity(node) ?? parentDensity;
      const densityToGap: Record<string, string> = {
        compact: "sm",
        normal: "md",
        spacious: "lg",
      };
      const resolvedGap = densityToGap[nodeDensity] ?? parentGap;
      node.gap = resolvedGap;
    }
    // If gap is explicitly "none", we respect that — don't override
  }

  // Step 3: Auto-insert spacers between consecutive leaf children
  if (opts.autoInsertSpacers) {
    autoInsertSpacersInChildren(node);
  }

  // Step 4: Recurse into children
  const effectiveNodeDensity = getDensity(node) ?? parentDensity;
  const children = getChildren(node);
  for (const child of children) {
    walkAndBeautify(
      child as Record<string, unknown>,
      effectiveNodeDensity,
      parentGap,
      opts,
    );
  }

  // Also handle split node's primary/secondary
  if (node.primary) {
    walkAndBeautify(
      node.primary as Record<string, unknown>,
      effectiveNodeDensity,
      parentGap,
      opts,
    );
  }
  if (node.secondary) {
    walkAndBeautify(
      node.secondary as Record<string, unknown>,
      effectiveNodeDensity,
      parentGap,
      opts,
    );
  }

  // Handle tabs' children
  if (Array.isArray(node.tabs)) {
    for (const tab of node.tabs as Array<Record<string, unknown>>) {
      if (Array.isArray(tab.children)) {
        for (const child of tab.children) {
          walkAndBeautify(
            child as Record<string, unknown>,
            effectiveNodeDensity,
            parentGap,
            opts,
          );
        }
      }
    }
  }
}

/** 获取节点的 children 数组（安全） */
function getChildren(node: Record<string, unknown>): unknown[] {
  if (Array.isArray(node.children)) return node.children;
  return [];
}

// -----------------------------------------------------------
// Auto-spacer insertion
// -----------------------------------------------------------

/** 不需要 spacer 的内容节点类型（它们自带视觉边界） */
const SELF_CONTAINED_TYPES = new Set([
  "panel",
  "modal",
  "drawer",
  "tabs",
  "table",
  "code_block",
  "chart_bar",
  "chart_line",
  "metric",
  "alert",
  "divider",
  "spacer",
  "container",
  "grid",
  "split",
  "region",
  "toolbar",
  "screen",
]);

/** 判断节点是否需要与其他节点保持间距 */
function needsSpacing(node: Record<string, unknown>): boolean {
  const t = node.type as string;
  return !SELF_CONTAINED_TYPES.has(t);
}

/** 在 children 数组中的连续 leaf 节点之间插入 spacer */
function autoInsertSpacersInChildren(parent: Record<string, unknown>): void {
  const children = parent.children as unknown[] | undefined;
  if (!Array.isArray(children) || children.length < 2) return;

  // Check if parent already has a gap mechanism (flex/grid with gap class)
  // We detect this by checking if parent is a container type with gap
  const parentType = parent.type as string;
  const parentGap = parent.gap as string | undefined;
  const hasGapMechanism =
    (parentType === "container" ||
      parentType === "grid" ||
      parentType === "panel" ||
      parentType === "screen" ||
      parentType === "region" ||
      parentType === "toolbar" ||
      parentType === "tabs" ||
      parentType === "modal" ||
      parentType === "drawer") &&
    parentGap !== "none" &&
    parentGap !== undefined;

  // If parent already has gap, we don't need to insert spacers
  if (hasGapMechanism) return;

  // Otherwise, insert spacers between consecutive non-self-contained children
  const newChildren: unknown[] = [];
  let spacerCounter = 0;

  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Record<string, unknown>;
    newChildren.push(child);

    if (i < children.length - 1) {
      const nextChild = children[i + 1] as Record<string, unknown>;
      if (needsSpacing(child) && needsSpacing(nextChild)) {
        // Insert a small spacer between consecutive leaf-like nodes
        const parentDensity = getDensity(parent) ?? "normal";
        const spacerSize =
          parentDensity === "compact"
            ? "xs"
            : parentDensity === "spacious"
              ? "sm"
              : "xs";
        newChildren.push({
          id: `${parent.id ?? "auto"}_spacer_${spacerCounter++}`,
          type: "spacer",
          size: spacerSize,
        });
      }
    }
  }

  parent.children = newChildren;
}
