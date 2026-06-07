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
// Repair — 自动修复 AI 输出中的常见问题
// -----------------------------------------------------------

const VALID_SEMANTIC_ROLES = new Set([
  "navigation",
  "input",
  "analysis_action",
  "local_adjustment",
  "display",
  "warning",
  "confirmation",
  "tool_result",
  "simulation_result",
  "digit",
  "operator",
  "clear",
  "calculate",
  "scientific_function",
  "memory_operation",
  "edit",
  "toggle",
  "submit",
]);

const VALID_TONES = new Set([
  "default",
  "muted",
  "primary",
  "success",
  "warning",
  "danger",
  "accent",
]);

const VALID_LOCAL_ACTION_TYPES = new Set([
  "increment",
  "decrement",
  "set_value",
  "toggle",
  "append_text",
]);

/** 修复 UI tree 中的常见 AI 输出问题（原地修改） */
function repairNodeTree(node: unknown): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  // 1. 修复非法 semanticRole → 移除（让其为 undefined）
  if ("semanticRole" in obj && typeof obj.semanticRole === "string") {
    if (!VALID_SEMANTIC_ROLES.has(obj.semanticRole)) {
      delete obj.semanticRole;
    }
  }

  // 2. 修复非法 style.tone → 移除
  if ("style" in obj && typeof obj.style === "object" && obj.style !== null) {
    const style = obj.style as Record<string, unknown>;
    if ("tone" in style && typeof style.tone === "string") {
      if (!VALID_TONES.has(style.tone)) {
        delete style.tone;
      }
    }
  }

  // 3. 修复非法 localAction.type → 移除整个 localAction
  if (
    "localAction" in obj &&
    typeof obj.localAction === "object" &&
    obj.localAction !== null
  ) {
    const la = obj.localAction as Record<string, unknown>;
    if ("type" in la && typeof la.type === "string") {
      if (!VALID_LOCAL_ACTION_TYPES.has(la.type)) {
        delete obj.localAction;
      }
    }
  }

  // 4. 修复 string layout → 移除（应该是 object）
  if ("layout" in obj && typeof obj.layout === "string") {
    delete obj.layout;
  }

  // 5. 修复 drawer 缺少必填字段
  if (obj.type === "drawer") {
    if (!obj.side || typeof obj.side !== "string") {
      obj.side = "right";
    }
    if (!obj.closeIntent || typeof obj.closeIntent !== "string") {
      obj.closeIntent = "close_drawer";
    }
  }

  // 递归修复子节点
  if ("children" in obj && Array.isArray(obj.children)) {
    for (const child of obj.children) repairNodeTree(child);
  }
  if ("primary" in obj) repairNodeTree(obj.primary);
  if ("secondary" in obj) repairNodeTree(obj.secondary);
  if ("tabs" in obj && Array.isArray(obj.tabs)) {
    for (const tab of obj.tabs) {
      if (
        tab &&
        typeof tab === "object" &&
        "children" in tab &&
        Array.isArray(tab.children)
      ) {
        for (const child of tab.children) repairNodeTree(child);
      }
    }
  }
  if ("footer" in obj && Array.isArray(obj.footer)) {
    for (const child of obj.footer) repairNodeTree(child);
  }
  if ("items" in obj && Array.isArray(obj.items)) {
    for (const item of obj.items) {
      if (
        item &&
        typeof item === "object" &&
        "children" in item &&
        Array.isArray(item.children)
      ) {
        for (const child of item.children) repairNodeTree(child);
      }
    }
  }
}

/** 对 AI 输出进行自动修复（在严格校验之前调用） */
function repairAIResponse(response: unknown): unknown {
  if (!response || typeof response !== "object") return response;
  const obj = response as Record<string, unknown>;
  const next = obj.next as Record<string, unknown> | undefined;
  if (next?.ui) {
    repairNodeTree(next.ui);
  }
  return obj;
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

/** 校验 AUIRResponse + 约束检查（自动修复后再校验） */
export function validateResponse(
  response: unknown,
  constraints: AUIRConstraints = defaultConstraints,
): ValidateResult<AUIRResponse> {
  // Step 0: 自动修复常见 AI 输出问题
  const repaired = repairAIResponse(response);

  const result = auirResponseSchema.safeParse(repaired);
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
