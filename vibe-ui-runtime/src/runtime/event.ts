import type { AUIREvent } from "@/src/auir/types";

let eventCounter = 0;

function makeId(): string {
  eventCounter++;
  return `evt_${String(eventCounter).padStart(4, "0")}`;
}

function now(): string {
  return new Date().toISOString();
}

export function createAppSearchEvent(query: string): AUIREvent {
  return {
    eventId: makeId(),
    timestamp: now(),
    type: "app.search",
    query,
  };
}

export function createComponentClickEvent(
  nodeId: string,
  nodeType: string,
  label?: string,
  intent?: string,
  payload?: Record<string, unknown>
): AUIREvent {
  return {
    eventId: makeId(),
    timestamp: now(),
    type: "component.click",
    target: {
      id: nodeId,
      type: nodeType,
      label,
      intent,
    },
    payload,
  };
}

export function createValueChangeEvent(
  nodeId: string,
  nodeType: string,
  binding: string | undefined,
  previousValue: unknown,
  nextValue: unknown
): AUIREvent {
  return {
    eventId: makeId(),
    timestamp: now(),
    type: "component.value_change",
    target: {
      id: nodeId,
      type: nodeType,
      binding,
    },
    payload: {
      previousValue,
      nextValue,
    },
  };
}

export function createTabChangeEvent(
  nodeId: string,
  previousTab: string | undefined,
  nextTab: string
): AUIREvent {
  return {
    eventId: makeId(),
    timestamp: now(),
    type: "tabs.change",
    target: { id: nodeId },
    payload: { previousTab, nextTab },
  };
}

export function createModalCloseEvent(
  nodeId: string,
  closeIntent?: string
): AUIREvent {
  return {
    eventId: makeId(),
    timestamp: now(),
    type: "modal.close",
    target: { id: nodeId, closeIntent },
  };
}

export function createFormSubmitEvent(
  nodeId: string,
  values: Record<string, unknown>
): AUIREvent {
  return {
    eventId: makeId(),
    timestamp: now(),
    type: "form.submit",
    target: { id: nodeId },
    payload: { values },
  };
}
