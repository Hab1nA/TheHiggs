import type { AUIRMemory, JsonPatchOperation } from "./types";

/**
 * Apply a JSON Patch operation to a memory object (shallow copy).
 */
function applyPatchOp(
  target: Record<string, unknown>,
  op: JsonPatchOperation
): Record<string, unknown> {
  const result = { ...target };
  switch (op.op) {
    case "add":
    case "replace":
      result[op.path] = op.value;
      break;
    case "remove":
      delete result[op.path];
      break;
  }
  return result;
}

/**
 * Apply a full AUIRMemoryPatch to the current memory.
 * Returns new memory object (immutable update).
 */
export function applyMemoryPatch(
  memory: AUIRMemory,
  sessionOps?: JsonPatchOperation[],
  appOps?: JsonPatchOperation[]
): AUIRMemory {
  let { session, app } = memory;

  if (sessionOps) {
    for (const op of sessionOps) {
      session = applyPatchOp(session, op);
    }
  }

  if (appOps) {
    for (const op of appOps) {
      app = applyPatchOp(app, op);
    }
  }

  return {
    ...memory,
    session,
    app,
  };
}
