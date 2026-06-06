// ============================================================
// Frontend Bindings — binding 解析与 UI 绑定工具
// ============================================================

import type { LocalUIState } from "@/auir/types";

/** 读取 binding 的当前值（localState 优先，fallback 次之） */
export function resolveBindingValue(
  localState: LocalUIState,
  binding: string,
  fallback?: unknown
): unknown {
  if (binding in localState.values) {
    return localState.values[binding];
  }
  return fallback;
}

/** 判断 binding 是否为 dirty（用户已修改但未提交） */
export function isBindingDirty(localState: LocalUIState, binding: string): boolean {
  return localState.dirtyBindings.includes(binding);
}
