// ============================================================
// Frontend Event — 事件构造与采集
// ============================================================

import type {
  AUIREvent,
  ButtonNode,
  ClientSnapshot,
  LocalUIState,
  UINode,
} from "@/auir/types";

let _eventCounter = 0;

function createEventId(): string {
  _eventCounter++;
  return `evt_${String(_eventCounter).padStart(4, "0")}_${Date.now()}`;
}

function ts(): string {
  return new Date().toISOString();
}

/** 创建 ClientSnapshot */
export function createClientSnapshot(
  localState: LocalUIState,
  currentUI: UINode | null,
): ClientSnapshot {
  return {
    localState,
    currentVisibleBindings: collectVisibleBindings(currentUI, localState),
  };
}

/** 创建 app.search 事件 */
export function createAppSearchEvent(
  query: string,
  opts?: {
    refine?: boolean;
    thinking?: boolean;
    refinedPrompt?: string;
    refinedContext?: {
      appKind?: string;
      appTitle?: string;
      appDescription?: string;
      keyFeatures?: string[];
      suggestedLayout?: string;
      suggestedComponents?: string[];
    };
  },
): AUIREvent {
  return {
    eventId: createEventId(),
    timestamp: ts(),
    type: "app.search",
    query,
    refine: opts?.refine,
    thinking: opts?.thinking,
    refinedPrompt: opts?.refinedPrompt,
    refinedContext: opts?.refinedContext,
  };
}

/** 创建 component.click 事件 */
export function createComponentClickEvent(
  node: ButtonNode,
  clientSnapshot?: ClientSnapshot,
): AUIREvent {
  return {
    eventId: createEventId(),
    timestamp: ts(),
    type: "component.click",
    target: {
      id: node.id,
      type: node.type,
      label: node.label,
      intent: node.intent,
      semanticRole: node.semanticRole,
      expectedEffect: node.expectedEffect,
    },
    payload: {},
    clientSnapshot,
  };
}

/** 创建 component.commit 事件 */
export function createComponentCommitEvent(
  nodeId: string,
  nodeType: string,
  binding: string | undefined,
  previousValue: unknown,
  nextValue: unknown,
  clientSnapshot: ClientSnapshot,
): AUIREvent {
  return {
    eventId: createEventId(),
    timestamp: ts(),
    type: "component.commit",
    target: {
      id: nodeId,
      type: nodeType,
      binding,
    },
    payload: {
      committedBinding: binding,
      previousValue,
      nextValue,
    },
    clientSnapshot,
  };
}

/** 创建 runtime.command 事件 */
export function createRuntimeCommandEvent(
  command: "restart" | "back_to_launcher" | "inspect_state",
  clientSnapshot?: ClientSnapshot,
): AUIREvent {
  return {
    eventId: createEventId(),
    timestamp: ts(),
    type: "runtime.command",
    command,
    clientSnapshot,
  };
}

/** 创建 tabs.change 事件 */
export function createTabChangeEvent(
  tabId: string,
  previousTab: string | undefined,
  nextTab: string,
  clientSnapshot?: ClientSnapshot,
): AUIREvent {
  return {
    eventId: createEventId(),
    timestamp: ts(),
    type: "tabs.change",
    target: { id: tabId },
    payload: { previousTab, nextTab },
    clientSnapshot,
  };
}

/** 创建 modal.close 事件 */
export function createModalCloseEvent(
  modalId: string,
  closeIntent: string,
  clientSnapshot?: ClientSnapshot,
): AUIREvent {
  return {
    eventId: createEventId(),
    timestamp: ts(),
    type: "modal.close",
    target: { id: modalId, closeIntent },
    clientSnapshot,
  };
}

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

/** 收集当前 UI 中所有 binding 的可见值 */
function collectVisibleBindings(
  node: unknown,
  localState: LocalUIState,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  function walk(n: unknown) {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    if ("binding" in obj && typeof obj.binding === "string") {
      const binding = obj.binding;
      result[binding] =
        binding in localState.values
          ? localState.values[binding]
          : (obj.value ?? obj.checked);
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
  return result;
}
