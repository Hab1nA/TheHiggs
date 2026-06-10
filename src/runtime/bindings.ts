// ============================================================
// Frontend Bindings — binding 解析与 UI 绑定工具
// ============================================================

import { resolveComputedValue } from "@/auir/computedBindings";
import type { LocalUIState } from "@/auir/types";

/** 读取 binding 的当前值（localState 优先，fallback 次之） */
export function resolveBindingValue(
  localState: LocalUIState,
  binding: string,
  fallback?: unknown,
): unknown {
  if (binding in localState.values) {
    return localState.values[binding];
  }
  return fallback;
}

/**
 * 读取 binding 的当前值，并自动解析计算表达式。
 * 当 binding 值包含 ${expr} 语法时，自动计算结果。
 * 用于显示类组件（local_value_display, metric 等）。
 */
export function resolveBindingValueComputed(
  localState: LocalUIState,
  binding: string,
  fallback?: unknown,
): unknown {
  const raw = resolveBindingValue(localState, binding, fallback);
  return resolveComputedValue(raw, localState);
}

/** 判断 binding 是否为 dirty（用户已修改但未提交） */
export function isBindingDirty(
  localState: LocalUIState,
  binding: string,
): boolean {
  return localState.dirtyBindings.includes(binding);
}
