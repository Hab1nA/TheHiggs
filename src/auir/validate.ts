// ============================================================
// AUIR Validate — 校验 + repair + retry 逻辑
// ============================================================

import { beautifyLayout } from "./beautify";
import { defaultConstraints } from "./constraints";
import { countNodes, maxDepth } from "./memory";
import { auirRequestSchema, auirResponseSchema } from "./schema";
import type { AUIRConstraints, AUIRRequest, AUIRResponse } from "./types";

export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

// -----------------------------------------------------------
// 数值字段自动修复（防御 LLM 类型幻觉）
// -----------------------------------------------------------

/**
 * 每种节点类型的「必须为 number」字段集合。
 * 仅收录 strict number 字段；string | number 联合类型（如 metric.value）不收录。
 */
const NUMERIC_FIELDS_BY_TYPE: Record<string, string[]> = {
  // 输入控件
  number_input: ["value", "min", "max", "step"],
  slider: ["value", "min", "max", "step"],
  stepper: ["value", "min", "max", "step"],
  // 展示控件
  progress: ["value", "max"],
  gauge: ["value", "min", "max"],
  // 图表
  chart_bar: [], // data[].value 在嵌套层处理
  chart_line: [], // data[].y 在嵌套层处理
  heatmap: [], // data[][] 在嵌套层处理
  radar_chart: ["maxValue"],
  // 步骤/时间
  steps: ["current"],
  clock: ["interval"],
  timer_refresh: ["seconds"],
  // 布局
  heading: ["level"],
  accordion: ["defaultOpenIndex"],
};

/** localAction increment/decrement 的数值字段 */
const LOCAL_ACTION_NUMERIC_FIELDS = ["step", "min", "max"];

/**
 * 安全地将 obj[field] 从字符串强制转换为数字。
 * 仅在值为非空字符串且可解析为有效数字时执行转换。
 * 原地修改 obj。
 */
function coerceToNumber(obj: Record<string, unknown>, field: string): boolean {
  if (!(field in obj)) return false;
  const val = obj[field];
  if (typeof val !== "string" || val === "") return false;
  const n = Number(val);
  if (isNaN(n)) return false;
  obj[field] = n;
  return true;
}

/**
 * 递归遍历 UI 树，将 LLM 输出的字符串数值自动转为数字。
 *
 * LLM（尤其是 DeepSeek）在 JSON 模式下偶尔将数值字段输出为
 * 带引号的字符串（如 "70" 而非 70）。此函数在 Zod 校验之前
 * 修复这类类型偏差，避免因微小格式问题浪费 AI 调用。
 *
 * 安全保证：
 * - 仅转换可被 Number() 解析的非空字符串
 * - 不修改已为 number 类型的值
 * - 不修改 string | number 联合类型的字段（如 metric.value）
 * - 非数字字符串（如 "abc"）保持原样，仍由 Zod 报错
 *
 * @param node UI 树的根节点（原地修改）
 */
export function repairNumericFields(node: unknown): void {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;

  const obj = node as Record<string, unknown>;
  const nodeType = typeof obj.type === "string" ? obj.type : undefined;

  // 1. 按节点类型修复直接字段
  if (nodeType) {
    const fields = NUMERIC_FIELDS_BY_TYPE[nodeType];
    if (fields) {
      for (const field of fields) coerceToNumber(obj, field);
    }
  }

  // 2. 修复 interaction.debounceMs（所有交互节点通用）
  if (obj.interaction && typeof obj.interaction === "object") {
    coerceToNumber(obj.interaction as Record<string, unknown>, "debounceMs");
  }

  // 3. 修复 localAction 数值字段
  if (obj.localAction && typeof obj.localAction === "object") {
    const la = obj.localAction as Record<string, unknown>;
    const laType = typeof la.type === "string" ? la.type : "";
    if (laType === "increment" || laType === "decrement") {
      for (const f of LOCAL_ACTION_NUMERIC_FIELDS) coerceToNumber(la, f);
    }
  }

  // 4. 修复嵌套数据结构
  // chart_bar.data[].value
  if (nodeType === "chart_bar" && Array.isArray(obj.data)) {
    for (const item of obj.data) {
      if (item && typeof item === "object")
        coerceToNumber(item as Record<string, unknown>, "value");
    }
  }
  // chart_line.data[].y
  if (nodeType === "chart_line" && Array.isArray(obj.data)) {
    for (const item of obj.data) {
      if (item && typeof item === "object")
        coerceToNumber(item as Record<string, unknown>, "y");
    }
  }
  // gauge.thresholds[].min/max
  if (nodeType === "gauge" && Array.isArray(obj.thresholds)) {
    for (const t of obj.thresholds) {
      if (t && typeof t === "object") {
        const to = t as Record<string, unknown>;
        coerceToNumber(to, "min");
        coerceToNumber(to, "max");
      }
    }
  }
  // heatmap.data[][]
  if (nodeType === "heatmap" && Array.isArray(obj.data)) {
    for (const row of obj.data) {
      if (!Array.isArray(row)) continue;
      for (let j = 0; j < row.length; j++) {
        if (typeof row[j] === "string" && row[j] !== "") {
          const n = Number(row[j]);
          if (!isNaN(n)) row[j] = n;
        }
      }
    }
  }
  // radar_chart.series[].values[]
  if (nodeType === "radar_chart" && Array.isArray(obj.series)) {
    for (const s of obj.series) {
      if (!s || typeof s !== "object" || !Array.isArray(s.values)) continue;
      for (let i = 0; i < s.values.length; i++) {
        if (typeof s.values[i] === "string" && s.values[i] !== "") {
          const n = Number(s.values[i]);
          if (!isNaN(n)) s.values[i] = n;
        }
      }
    }
  }

  // 5. 递归遍历子节点
  if (Array.isArray(obj.children)) {
    for (const child of obj.children) repairNumericFields(child);
  }
  if (obj.primary && typeof obj.primary === "object")
    repairNumericFields(obj.primary);
  if (obj.secondary && typeof obj.secondary === "object")
    repairNumericFields(obj.secondary);
  if (Array.isArray(obj.tabs)) {
    for (const tab of obj.tabs) {
      if (tab && typeof tab === "object" && Array.isArray(tab.children)) {
        for (const child of tab.children) repairNumericFields(child);
      }
    }
  }
  if (Array.isArray(obj.footer)) {
    for (const child of obj.footer) repairNumericFields(child);
  }
  if (Array.isArray(obj.items)) {
    for (const item of obj.items) {
      if (item && typeof item === "object") repairNumericFields(item);
    }
  }
}

/** 校验 AUIRRequest */
export function validateRequest(json: unknown): ValidateResult<AUIRRequest> {
  const result = auirRequestSchema.safeParse(json);
  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `[${i.path.join(".")}] ${i.message}`,
    );
    return { ok: false, errors };
  }
  return { ok: true, value: result.data as AUIRRequest };
}

/** 校验 AUIRResponse + 约束检查 */
export function validateResponse(
  response: unknown,
  constraints: AUIRConstraints = defaultConstraints,
): ValidateResult<AUIRResponse> {
  // Pre-repair: 自动修复 LLM 输出的字符串数值（如 "70" → 70）
  repairResponse(response);

  const result = auirResponseSchema.safeParse(response);
  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `[${i.path.join(".")}] ${i.message}`,
    );
    return { ok: false, errors };
  }

  const data = result.data as AUIRResponse;

  // Post-parse constraint checks
  const constraintErrors: string[] = [];

  // Check allowed components
  if (data.next?.ui) {
    const usedComponents = collectComponentTypes(data.next.ui);
    for (const comp of usedComponents) {
      if (!constraints.allowedComponents.includes(comp)) {
        constraintErrors.push(
          `Component "${comp}" is not in allowedComponents`,
        );
      }
    }
  }

  // Check node count
  if (data.next?.ui) {
    const nodeCount = countNodes(data.next.ui);
    if (nodeCount > constraints.maxNodes) {
      constraintErrors.push(
        `Node count ${nodeCount} exceeds max ${constraints.maxNodes}`,
      );
    }
  }

  // Check max depth
  if (data.next?.ui) {
    const depth = maxDepth(data.next.ui);
    if (depth > constraints.maxDepth) {
      constraintErrors.push(
        `Tree depth ${depth} exceeds max ${constraints.maxDepth}`,
      );
    }
  }

  // Check H1 heading count (should be at most 1 per screen)
  if (data.next?.ui) {
    const h1Count = countH1Headings(data.next.ui);
    if (h1Count > 1) {
      constraintErrors.push(
        `Screen has ${h1Count} H1 headings, but should have at most 1. Use H2-H4 for subsections.`,
      );
    }
  }

  if (constraintErrors.length > 0) {
    return { ok: false, errors: constraintErrors };
  }

  return { ok: true, value: data };
}

/** 带 1 次 retry 的 validate-and-repair 流程 */
export async function validateOrRetry(
  generateFn: () => Promise<unknown>,
  constraints?: AUIRConstraints,
): Promise<AUIRResponse> {
  // First attempt
  const raw = await generateFn();
  const firstResult = validateResponse(raw, constraints);
  if (firstResult.ok) {
    // Post-validation: auto-beautify layout spacing
    if (firstResult.value.next?.ui) {
      beautifyLayout(firstResult.value.next.ui, {
        defaultDensity: "normal",
        defaultGap: "md",
      });
    }
    return firstResult.value;
  }

  console.warn(
    "[AUIR Validate] First attempt failed, retrying...",
    firstResult.errors,
  );

  // Second attempt
  const raw2 = await generateFn();
  const secondResult = validateResponse(raw2, constraints);
  if (secondResult.ok) {
    // Post-validation: auto-beautify layout spacing
    if (secondResult.value.next?.ui) {
      beautifyLayout(secondResult.value.next.ui, {
        defaultDensity: "normal",
        defaultGap: "md",
      });
    }
    return secondResult.value;
  }

  console.error("[AUIR Validate] Retry also failed:", secondResult.errors);
  // Throw so callers (e.g. generateWithRetry) can catch and attempt
  // higher-level fallback strategies instead of silently returning a
  // fallback AUIRResponse that looks like a real AI generation.
  throw new Error(
    `[AUIR Validate] Schema validation failed after retry: ${secondResult.errors.join("; ")}`,
  );
}

/**
 * 修复 AUIRResponse 中的字符串数值。
 * 在 safeParse 之前调用，确保 Zod 看到正确的类型。
 */
function repairResponse(response: unknown): void {
  if (!response || typeof response !== "object") return;
  const r = response as Record<string, unknown>;
  if (r.next && typeof r.next === "object") {
    const next = r.next as Record<string, unknown>;
    if (next.ui) repairNumericFields(next.ui);
  }
}

/** 收集 UI tree 中所有用到的组件类型 */
function collectComponentTypes(node: unknown): Set<string> {
  const types = new Set<string>();
  function walk(n: unknown) {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    if ("type" in obj && typeof obj.type === "string") {
      types.add(obj.type);
    }
    if ("children" in obj && Array.isArray(obj.children)) {
      for (const child of obj.children) walk(child);
    }
    if ("primary" in obj) walk(obj.primary);
    if ("secondary" in obj) walk(obj.secondary);
    if ("tabs" in obj && Array.isArray(obj.tabs)) {
      for (const tab of obj.tabs) {
        if (
          tab &&
          typeof tab === "object" &&
          "children" in tab &&
          Array.isArray(tab.children)
        ) {
          for (const child of tab.children) walk(child);
        }
      }
    }
  }
  walk(node);
  return types;
}

/** 计算 UI tree 中 H1 标题的数量 */
function countH1Headings(node: unknown): number {
  let count = 0;
  function walk(n: unknown) {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    if (
      obj.type === "heading" &&
      typeof obj.level === "number" &&
      obj.level === 1
    ) {
      count++;
    }
    if ("children" in obj && Array.isArray(obj.children)) {
      for (const child of obj.children) walk(child);
    }
    if ("primary" in obj) walk(obj.primary);
    if ("secondary" in obj) walk(obj.secondary);
    if ("tabs" in obj && Array.isArray(obj.tabs)) {
      for (const tab of obj.tabs) {
        if (
          tab &&
          typeof tab === "object" &&
          "children" in tab &&
          Array.isArray(tab.children)
        ) {
          for (const child of tab.children) walk(child);
        }
      }
    }
  }
  walk(node);
  return count;
}
