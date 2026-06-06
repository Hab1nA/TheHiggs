// ============================================================
// CopilotKit Readable State — 暴露 AUIR 状态给 CopilotKit（可选占位）
// ============================================================

import type { AUIRMemory, AUIRState } from "@/auir/types";

/** 构建 CopilotKit useCopilotReadable 所需的 value 对象 */
export function buildCopilotReadableValue(
  state: AUIRState | null,
  memory: AUIRMemory,
  turn: number
) {
  return {
    app: state?.app ?? null,
    memory: {
      app: memory.app,
      session: memory.session,
    },
    turn,
  };
}
