// ============================================================
// AUIR Memory — 记忆系统初始化与 patch 应用
// ============================================================

import type { AUIRMemory, AUIRMemoryPatch, JsonPatchOperation, RetrievedUserMemory } from "./types";

/** 创建初始空白记忆 */
export function createInitialMemory(userMemory: RetrievedUserMemory[] = []): AUIRMemory {
  return {
    turn: {},
    session: {},
    app: {},
    user: userMemory,
  };
}

/** 应用 memory patch 到现有 memory（由前端调用，接通 memoryPatch 管线） */
export function applyMemoryPatch(memory: AUIRMemory, patch: AUIRMemoryPatch): AUIRMemory {
  const next = structuredClone(memory);

  if (patch.session) {
    next.session = applyJsonPatch(next.session, patch.session);
  }
  if (patch.app) {
    next.app = applyJsonPatch(next.app, patch.app);
  }
  if (patch.userCandidates && patch.userCandidates.length > 0) {
    // MVP: auto-accept candidates with confidence >= 0.8
    const toAccept = patch.userCandidates.filter(
      (c) => c.confidence >= 0.8 && !c.requiresUserConsent
    );
    for (const candidate of toAccept) {
      const existingIdx = next.user.findIndex((u) => u.key === candidate.key);
      const entry: RetrievedUserMemory = {
        key: candidate.key,
        value: candidate.value,
        source: candidate.source,
        confidence: candidate.confidence,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        sensitivity: "low",
      };
      if (existingIdx >= 0) {
        next.user[existingIdx] = entry;
      } else {
        next.user.push(entry);
      }
    }
  }

  return next;
}

/** 将 AI 返回的 memory 合并到当前 memory（全量替换模式） */
export function hydrateMemoryFromState(
  current: AUIRMemory,
  appMemory: Record<string, unknown>,
  sessionMemory: Record<string, unknown>
): AUIRMemory {
  return {
    ...current,
    app: { ...current.app, ...appMemory },
    session: { ...current.session, ...sessionMemory },
  };
}

/** 清空 turn memory（每个 turn 开始） */
export function resetTurnMemory(memory: AUIRMemory): AUIRMemory {
  return { ...memory, turn: {} };
}

// -----------------------------------------------------------
// JSON Patch 工具
// -----------------------------------------------------------

/** 对普通 object 应用 RFC 6902 JSON Patch 操作（支持嵌套路径） */
function applyJsonPatch(
  obj: Record<string, unknown>,
  ops: JsonPatchOperation[]
): Record<string, unknown> {
  const result = { ...obj };
  for (const op of ops) {
    const cleanPath = op.path.startsWith("/") ? op.path.slice(1) : op.path;
    if (!cleanPath) continue; // skip empty path
    const segments = cleanPath.split("/");

    if (segments.length === 1) {
      // Flat path — direct access (backward compatible)
      switch (op.op) {
        case "add":
        case "replace":
          result[segments[0]] = op.value;
          break;
        case "remove":
          delete result[segments[0]];
          break;
      }
    } else {
      // Nested path — walk to parent, then operate on final key
      let current: Record<string, unknown> = result;
      for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i];
        if (typeof current[seg] !== "object" || current[seg] === null) {
          // Intermediate path doesn't exist — create it for add/replace
          if (op.op === "add" || op.op === "replace") {
            current[seg] = {};
          } else {
            current = {};
            break;
          }
        }
        current = current[seg] as Record<string, unknown>;
      }
      const lastKey = segments[segments.length - 1];
      switch (op.op) {
        case "add":
        case "replace":
          current[lastKey] = op.value;
          break;
        case "remove":
          delete current[lastKey];
          break;
      }
    }
  }
  return result;
}

/** 从 UI node tree 中提取所有 binding 的默认值 */
export function extractBindingsFromUI(
  node: unknown,
  memory: { app: Record<string, unknown>; session: Record<string, unknown> }
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  function walk(n: unknown) {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;

    // If this node has a binding, extract its value
    if ("binding" in obj && typeof obj.binding === "string") {
      const binding = obj.binding;
      // Priority: node value > app memory > session memory
      if ("value" in obj && obj.value !== undefined) {
        result[binding] = obj.value;
      } else if ("checked" in obj) {
        result[binding] = obj.checked;
      } else {
        // Try to resolve from memory
        const memPath = binding.replace(/^app\./, "");
        if (memPath in memory.app) {
          result[binding] = memory.app[memPath];
        } else if (memPath in memory.session) {
          result[binding] = memory.session[memPath];
        }
      }
    }

    // Recurse into children
    if ("children" in obj && Array.isArray(obj.children)) {
      for (const child of obj.children) walk(child);
    }
    if ("primary" in obj) walk(obj.primary);
    if ("secondary" in obj) walk(obj.secondary);
    if ("tabs" in obj && Array.isArray(obj.tabs)) {
      for (const tab of obj.tabs) {
        if (tab && typeof tab === "object" && "children" in tab && Array.isArray(tab.children)) {
          for (const child of tab.children) walk(child);
        }
      }
    }
  }

  walk(node);
  return result;
}

/** 统计 UI tree 中的节点数 */
export function countNodes(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  let count = 1;
  const obj = node as Record<string, unknown>;
  if ("children" in obj && Array.isArray(obj.children)) {
    for (const child of obj.children) count += countNodes(child);
  }
  if ("primary" in obj) count += countNodes(obj.primary);
  if ("secondary" in obj) count += countNodes(obj.secondary);
  if ("tabs" in obj && Array.isArray(obj.tabs)) {
    for (const tab of obj.tabs) {
      if (tab && typeof tab === "object" && "children" in tab && Array.isArray(tab.children)) {
        for (const child of tab.children) count += countNodes(child);
      }
    }
  }
  return count;
}

/** 计算 UI tree 的最大深度 */
export function maxDepth(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  let maxChildDepth = 0;
  const obj = node as Record<string, unknown>;
  if ("children" in obj && Array.isArray(obj.children)) {
    for (const child of obj.children) {
      maxChildDepth = Math.max(maxChildDepth, maxDepth(child));
    }
  }
  if ("primary" in obj) maxChildDepth = Math.max(maxChildDepth, maxDepth(obj.primary));
  if ("secondary" in obj) maxChildDepth = Math.max(maxChildDepth, maxDepth(obj.secondary));
  if ("tabs" in obj && Array.isArray(obj.tabs)) {
    for (const tab of obj.tabs) {
      if (tab && typeof tab === "object" && "children" in tab && Array.isArray(tab.children)) {
        for (const child of tab.children) {
          maxChildDepth = Math.max(maxChildDepth, maxDepth(child));
        }
      }
    }
  }
  return 1 + maxChildDepth;
}
