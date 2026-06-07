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
