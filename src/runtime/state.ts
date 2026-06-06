// ============================================================
// Frontend State Management — localState 管理
// ============================================================

import { extractBindingsFromUI } from "@/auir/memory";
import type { AUIRState, LocalUIState } from "@/auir/types";

/** 创建初始 LocalUIState */
export function createInitialLocalUIState(): LocalUIState {
  return {
    values: {},
    dirtyBindings: [],
    updatedAt: new Date().toISOString(),
  };
}

/** 更新单个 binding 的值 */
export function setLocalValue(
  prev: LocalUIState,
  binding: string,
  value: unknown
): LocalUIState {
  const dirtyBindings = prev.dirtyBindings.includes(binding)
    ? prev.dirtyBindings
    : [...prev.dirtyBindings, binding];

  return {
    values: { ...prev.values, [binding]: value },
    dirtyBindings,
    updatedAt: new Date().toISOString(),
  };
}

/** 从 AUIRState 重新 hydrate localState（AI 返回后同步） */
export function hydrateLocalStateFromAUIRState(next: AUIRState): LocalUIState {
  const bindings = extractBindingsFromUI(next.ui, next.memory);
  return {
    values: bindings,
    dirtyBindings: [],
    updatedAt: new Date().toISOString(),
  };
}

/** 清空 dirtyBindings（提交后） */
export function clearDirtyBindings(prev: LocalUIState): LocalUIState {
  return {
    ...prev,
    dirtyBindings: [],
  };
}
