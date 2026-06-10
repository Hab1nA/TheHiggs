// ============================================================
// Memory System — 单元测试
// ============================================================
// 覆盖：
//   1. applyJsonPatch 嵌套路径（RFC 6902）
//   2. applyMemoryPatch 完整管线
//   3. createInitialMemory / resetTurnMemory
//   4. extractBindingsFromUI 记忆回退
// ============================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

function readSrc(relPath) {
  return readFileSync(join(projectRoot, relPath), "utf-8");
}

// ─── Source-level verification ───────────────────────────────

describe("Memory System — Source Verification", () => {
  it("applyMemoryPatch is exported from memory.ts", () => {
    const src = readSrc("src/auir/memory.ts");
    assert.ok(
      src.includes("export function applyMemoryPatch"),
      "applyMemoryPatch should be exported",
    );
  });

  it("page.tsx imports applyMemoryPatch", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("applyMemoryPatch"),
      "page.tsx should import applyMemoryPatch",
    );
  });

  it("page.tsx calls applyMemoryPatch when memoryPatch exists", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("applyMemoryPatch(latestMemory, response.memoryPatch)"),
      "page.tsx should call applyMemoryPatch with latestMemory and response.memoryPatch",
    );
  });

  it("applyJsonPatch handles nested paths (not just flat keys)", () => {
    const src = readSrc("src/auir/memory.ts");
    // Should split path by "/" and walk nested objects
    assert.ok(
      src.includes('cleanPath.split("/")'),
      "applyJsonPatch should split path into segments",
    );
    // Should handle nested walk
    assert.ok(
      src.includes("segments.length - 1"),
      "applyJsonPatch should walk to parent for nested paths",
    );
  });

  it("memory.ts does NOT use flat-only path handling", () => {
    const src = readSrc("src/auir/memory.ts");
    // The old code did: result[cleanPath] = op.value (treats entire path as key)
    // The new code should split and walk
    // Verify the old pattern is gone by checking that segments are used
    const lines = src.split("\n");
    const patchFnStart = lines.findIndex((l) =>
      l.includes("function applyJsonPatch"),
    );
    assert.ok(patchFnStart >= 0, "applyJsonPatch function exists");
    // Find the function body
    const fnBody = lines.slice(patchFnStart, patchFnStart + 50).join("\n");
    assert.ok(
      fnBody.includes("segments"),
      "Function body should use segments array",
    );
    assert.ok(
      fnBody.includes("lastKey"),
      "Function body should use lastKey for final property access",
    );
  });
});

// ─── Behavioral verification via source analysis ─────────────

describe("Memory System — Behavioral Verification", () => {
  it("page.tsx memory update applies patch BEFORE merging embedded memory", () => {
    const src = readSrc("app/page.tsx");
    // The code computes nextMemory: patch first, then merge embedded memory
    const patchSection = src.indexOf(
      "const patchedForCheck = response.memoryPatch",
    );
    assert.ok(patchSection >= 0, "patchedForCheck computation exists");

    const section = src.slice(patchSection, patchSection + 600);
    // applyMemoryPatch should come BEFORE the spread merge
    const patchCallIdx = section.indexOf("applyMemoryPatch");
    const mergeIdx = section.indexOf("...patchedForCheck");
    assert.ok(patchCallIdx >= 0, "applyMemoryPatch is called");
    assert.ok(mergeIdx >= 0, "patched memory is merged");
    assert.ok(
      patchCallIdx < mergeIdx,
      "applyMemoryPatch is called before merging embedded memory",
    );
  });

  it("page.tsx handles undefined memoryPatch gracefully", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("response.memoryPatch"),
      "page.tsx checks for memoryPatch existence",
    );
    assert.ok(
      src.includes("? applyMemoryPatch("),
      "page.tsx uses conditional to handle missing memoryPatch",
    );
  });

  it("applyMemoryPatch auto-accepts user candidates with confidence >= 0.8", () => {
    const src = readSrc("src/auir/memory.ts");
    assert.ok(
      src.includes("c.confidence >= 0.8"),
      "Should filter by confidence threshold",
    );
    assert.ok(
      src.includes("!c.requiresUserConsent"),
      "Should check requiresUserConsent flag",
    );
  });

  it("applyMemoryPatch creates RetrievedUserMemory with proper defaults", () => {
    const src = readSrc("src/auir/memory.ts");
    assert.ok(
      src.includes('sensitivity: "low"'),
      "Default sensitivity should be low",
    );
    assert.ok(
      src.includes("new Date().toISOString()"),
      "Should set timestamps",
    );
  });

  it("turn memory is set with event metadata after AI response", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("turn: { eventType: event.type, eventId: event.eventId }"),
      "Turn memory should contain event metadata",
    );
  });

  it("extractBindingsFromUI resolves from app memory then session memory", () => {
    const src = readSrc("src/auir/memory.ts");
    assert.ok(
      src.includes("memPath in memory.app"),
      "Should check app memory first",
    );
    assert.ok(
      src.includes("memPath in memory.session"),
      "Should fall back to session memory",
    );
  });

  it("back_to_launcher clears memory and resets session ID (app isolation)", () => {
    const src = readSrc("app/page.tsx");
    // Find the back_to_launcher handler
    const handlerIdx = src.indexOf('command === "back_to_launcher"');
    assert.ok(handlerIdx >= 0, "back_to_launcher handler exists");
    const handler = src.slice(handlerIdx, handlerIdx + 800);
    assert.ok(
      handler.includes("setMemory(createInitialMemory())"),
      "back_to_launcher should reset memory to initial state",
    );
    assert.ok(
      handler.includes("sessionIdRef.current ="),
      "back_to_launcher should generate a new session ID",
    );
    assert.ok(
      handler.includes("setTurn(0)"),
      "back_to_launcher should reset turn counter",
    );
  });
});

// ─── Integration: AUIR Schema compatibility ──────────────────

describe("Memory System — Schema Compatibility", () => {
  it("auirMemoryPatchSchema is defined and exported", () => {
    const src = readSrc("src/auir/schema.ts");
    assert.ok(
      src.includes("export const auirMemoryPatchSchema"),
      "auirMemoryPatchSchema should be exported",
    );
  });

  it("auirResponseSchema includes optional memoryPatch", () => {
    const src = readSrc("src/auir/schema.ts");
    assert.ok(
      src.includes("memoryPatch: auirMemoryPatchSchema.optional()"),
      "auirResponseSchema should have optional memoryPatch field",
    );
  });

  it("AUIRMemory type includes all four layers", () => {
    const src = readSrc("src/auir/types.ts");
    // Find the AUIRMemory type
    const memTypeIdx = src.indexOf("export type AUIRMemory = {");
    assert.ok(memTypeIdx >= 0, "AUIRMemory type exists");
    const memType = src.slice(memTypeIdx, memTypeIdx + 200);
    assert.ok(memType.includes("turn:"), "Has turn layer");
    assert.ok(memType.includes("session:"), "Has session layer");
    assert.ok(memType.includes("app:"), "Has app layer");
    assert.ok(memType.includes("user:"), "Has user layer");
  });

  it("JsonPatchOperation supports add, replace, remove", () => {
    const src = readSrc("src/auir/types.ts");
    assert.ok(
      src.includes('"add" | "replace" | "remove"'),
      "JsonPatchOperation should support add/replace/remove",
    );
  });
});

// ─── Memory Compression ──────────────────────────────────────

describe("Memory Compression — Async Post-Generation", () => {
  it("/api/compress-memory route exists", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("export async function POST"),
      "compress-memory route should export POST handler",
    );
  });

  it("compress-memory uses AI SDK generateObject", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("generateObject("),
      "Should use Vercel AI SDK generateObject",
    );
  });

  it("compress-memory has mock mode fallback", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(src.includes("isMockMode()"), "Should check mock mode");
    assert.ok(
      src.includes("mockCompress"),
      "Should have mockCompress fallback",
    );
  });

  it("page.tsx triggers compression asynchronously after response", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("compressMemoryIfNeeded(nextMemory, setMemory)"),
      "Should call compressMemoryIfNeeded with nextMemory",
    );
    assert.ok(
      src.includes("void compressMemoryIfNeeded"),
      "Should be fire-and-forget (void)",
    );
  });

  it("compression threshold is defined", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("MEMORY_COMPRESS_THRESHOLD"),
      "Should define compression threshold",
    );
    assert.ok(src.includes("8000"), "Threshold should be 8000 chars");
  });

  it("compression preserves turn and user layers", () => {
    const src = readSrc("app/page.tsx");
    // The compressMemoryIfNeeded function should only replace session/app
    assert.ok(
      src.includes("session: data.compressed.session"),
      "Should replace session with compressed version",
    );
    assert.ok(
      src.includes("app: data.compressed.app"),
      "Should replace app with compressed version",
    );
  });
});
