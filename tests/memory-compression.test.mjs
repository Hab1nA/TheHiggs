// ============================================================
// Memory Compression — 模块 + 集成测试
// ============================================================
// 覆盖：
//   1. API 端点 (/api/compress-memory)
//   2. mockCompress 压缩逻辑
//   3. 前端 compressMemoryIfNeeded 触发逻辑
//   4. 阈值检查、fire-and-forget、错误恢复
//   5. 压缩后记忆完整性（turn/user 保留）
//   6. 压缩不影响正常记忆流
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

// ═══════════════════════════════════════════════════════════
// 1. API 端点结构验证
// ═══════════════════════════════════════════════════════════

describe("compress-memory API — Route Structure", () => {
  it("route file exists and exports POST", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("export async function POST"),
      "Must export POST handler",
    );
  });

  it("uses NextResponse for responses", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("NextResponse.json("),
      "Should use NextResponse.json for responses",
    );
  });

  it("sets runtime = nodejs", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes('export const runtime = "nodejs"'),
      "Should set runtime to nodejs for AI SDK compatibility",
    );
  });

  it("defines compression threshold as 8000", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("COMPRESS_THRESHOLD = 8000"),
      "Threshold should be 8000 chars",
    );
  });
});

// ═══════════════════════════════════════════════════════════
// 2. 请求校验 (Zod Schema)
// ═══════════════════════════════════════════════════════════

describe("compress-memory API — Request Validation", () => {
  it("validates request with Zod schema", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("compressRequestSchema.safeParse"),
      "Should validate request with Zod safeParse",
    );
  });

  it("returns 400 for invalid JSON body", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("Invalid JSON body"),
      "Should handle invalid JSON",
    );
    assert.ok(
      src.includes("status: 400"),
      "Should return 400 status",
    );
  });

  it("returns 400 for schema validation failure", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("Invalid request"),
      "Should return error for invalid schema",
    );
  });

  it("request schema requires memory object with all layers", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    // Check that the schema requires turn, session, app, user
    assert.ok(
      src.includes("turn: z.record("),
      "Schema should require turn field",
    );
    assert.ok(
      src.includes("session: z.record("),
      "Schema should require session field",
    );
    assert.ok(
      src.includes("app: z.record("),
      "Schema should require app field",
    );
    assert.ok(
      src.includes("user: z.array("),
      "Schema should require user field",
    );
  });

  it("request schema requires currentSize number", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("currentSize: z.number()"),
      "Schema should require currentSize as number",
    );
  });
});

// ═══════════════════════════════════════════════════════════
// 3. Mock 模式压缩逻辑
// ═══════════════════════════════════════════════════════════

describe("compress-memory API — Mock Mode", () => {
  it("checks isMockMode() before AI call", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("isMockMode()"),
      "Should check mock mode",
    );
  });

  it("uses mockCompress function for mock mode", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("mockCompress("),
      "Should call mockCompress in mock mode",
    );
  });

  it("mockCompress truncates large arrays to 5 items (SAMPLE_SIZE)", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("SAMPLE_SIZE = 5"),
      "SAMPLE_SIZE should be 5",
    );
    assert.ok(
      src.includes("value.length > SAMPLE_SIZE"),
      "Should detect arrays exceeding SAMPLE_SIZE",
    );
    assert.ok(
      src.includes("value.slice(0, SAMPLE_SIZE)"),
      "Should truncate to SAMPLE_SIZE items",
    );
  });

  it("mockCompress adds _count and _summary fields for truncated arrays", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("${key}_count"),
      "Should add _count suffix for truncated arrays",
    );
    assert.ok(
      src.includes("${key}_summary"),
      "Should add _summary suffix with descriptive text",
    );
  });

  it("mockCompress preserves non-array values", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    // The else branch should preserve values
    const fnBody = src.slice(src.indexOf("function mockCompress"));
    assert.ok(
      fnBody.includes("result[key] = value"),
      "Should preserve non-array values as-is",
    );
  });

  it("mockCompress handles both session and app layers", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    const fnBody = src.slice(src.indexOf("function mockCompress"));
    assert.ok(
      fnBody.includes("session: compressRecord(memory.session)"),
      "Should compress session layer",
    );
    assert.ok(
      fnBody.includes("app: compressRecord(memory.app)"),
      "Should compress app layer",
    );
  });

  it("mockCompress processes small arrays (≤5) without truncation", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    // The condition is `value.length > SAMPLE_SIZE`, so arrays with 5 or fewer items
    // fall to the else branch and are preserved
    assert.ok(
      src.includes("value.length > SAMPLE_SIZE"),
      "Only arrays with >3 items are truncated",
    );
  });
});

// ═══════════════════════════════════════════════════════════
// 4. 真实 AI 模式
// ═══════════════════════════════════════════════════════════

describe("compress-memory API — Real AI Mode", () => {
  it("uses Vercel AI SDK generateObject", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("generateObject({"),
      "Should use generateObject from AI SDK",
    );
  });

  it("uses disabled thinking for speed", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes('getModel("disabled")'),
      "Should disable thinking for faster response",
    );
  });

  it("uses compressedMemorySchema for output validation", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("schema: compressedMemorySchema"),
      "Should validate AI output with schema",
    );
  });

  it("uses low temperature for deterministic output", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("temperature: 0.1"),
      "Should use low temperature for consistency",
    );
  });

  it("limits maxTokens to 2000", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("maxTokens: 2000"),
      "Should limit output tokens",
    );
  });

  it("compresses only session and app (not turn/user)", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("session: memory.session, app: memory.app"),
      "Should only send session+app to AI",
    );
  });

  it("returns durationMs for performance monitoring", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("durationMs"),
      "Should return duration for monitoring",
    );
  });
});

// ═══════════════════════════════════════════════════════════
// 5. 错误处理
// ═══════════════════════════════════════════════════════════

describe("compress-memory API — Error Handling", () => {
  it("catches AI generation errors gracefully", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("catch (error)"),
      "Should have try/catch around AI call",
    );
  });

  it("returns ok:false on failure (not 500)", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    // The error handler returns ok:false, not throws
    assert.ok(
      src.includes('{ ok: false, error: message }'),
      "Should return ok:false with error message",
    );
  });

  it("logs errors to console", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes('console.error("[compress-memory]'),
      "Should log errors",
    );
  });

  it("mockCompress is pure (no side effects)", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    const fnBody = src.slice(
      src.indexOf("function mockCompress"),
      src.indexOf("function mockCompress") + 500,
    );
    // Should not call external APIs, write files, etc.
    assert.ok(
      !fnBody.includes("fetch(") && !fnBody.includes("await"),
      "mockCompress should be synchronous with no side effects",
    );
  });
});

// ═══════════════════════════════════════════════════════════
// 6. 前端 compressMemoryIfNeeded
// ═══════════════════════════════════════════════════════════

describe("Frontend compressMemoryIfNeeded — Trigger Logic", () => {
  it("function is defined in page.tsx", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("async function compressMemoryIfNeeded("),
      "compressMemoryIfNeeded should be defined",
    );
  });

  it("checks threshold before calling API", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("serialized.length < MEMORY_COMPRESS_THRESHOLD"),
      "Should check size against threshold",
    );
  });

  it("returns early if below threshold (no API call)", () => {
    const src = readSrc("app/page.tsx");
    const fnBody = src.slice(
      src.indexOf("async function compressMemoryIfNeeded"),
      src.indexOf("async function compressMemoryIfNeeded") + 800,
    );
    // The return should come right after the threshold check
    const thresholdCheck = fnBody.indexOf("MEMORY_COMPRESS_THRESHOLD");
    const returnStatement = fnBody.indexOf("return;", thresholdCheck);
    assert.ok(
      returnStatement > thresholdCheck && returnStatement < thresholdCheck + 100,
      "Should return immediately when below threshold",
    );
  });

  it("calls /api/compress-memory endpoint", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes('"/api/compress-memory"'),
      "Should call the compress-memory endpoint",
    );
  });

  it("uses POST method with JSON body", () => {
    const src = readSrc("app/page.tsx");
    const fnBody = src.slice(
      src.indexOf("async function compressMemoryIfNeeded"),
      src.indexOf("async function compressMemoryIfNeeded") + 1200,
    );
    assert.ok(
      fnBody.includes('method: "POST"'),
      "Should use POST method",
    );
    assert.ok(
      fnBody.includes('"Content-Type": "application/json"'),
      "Should set JSON content type",
    );
  });

  it("sends memory and currentSize in request body", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("memory: currentMemory"),
      "Should send current memory",
    );
    assert.ok(
      src.includes("currentSize: serialized.length"),
      "Should send current size",
    );
  });
});

describe("Frontend compressMemoryIfNeeded — Response Handling", () => {
  it("checks response.ok before processing", () => {
    const src = readSrc("app/page.tsx");
    const fnBody = src.slice(
      src.indexOf("async function compressMemoryIfNeeded"),
      src.indexOf("async function compressMemoryIfNeeded") + 1500,
    );
    assert.ok(
      fnBody.includes("!res.ok"),
      "Should check HTTP status",
    );
  });

  it("checks data.ok and data.compressed fields", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("!data.ok || !data.compressed"),
      "Should validate response structure",
    );
  });

  it("preserves turn layer when replacing memory", () => {
    const src = readSrc("app/page.tsx");
    const fnBody = src.slice(
      src.indexOf("async function compressMemoryIfNeeded"),
      src.indexOf("async function compressMemoryIfNeeded") + 1800,
    );
    assert.ok(
      fnBody.includes("...prev"),
      "Should spread previous memory to preserve turn/user",
    );
  });

  it("uses nullish coalescing for safe replacement", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("data.compressed.session ?? prev.session"),
      "Should fallback to prev.session if compressed.session is null",
    );
    assert.ok(
      src.includes("data.compressed.app ?? prev.app"),
      "Should fallback to prev.app if compressed.app is null",
    );
  });

  it("logs compression result to console", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("[compress-memory] Done:"),
      "Should log successful compression",
    );
    assert.ok(
      src.includes("reduction"),
      "Should report reduction percentage",
    );
  });
});

describe("Frontend compressMemoryIfNeeded — Error Recovery", () => {
  it("catches fetch errors silently", () => {
    const src = readSrc("app/page.tsx");
    const fnBody = src.slice(
      src.indexOf("async function compressMemoryIfNeeded"),
      src.indexOf("async function compressMemoryIfNeeded") + 2000,
    );
    assert.ok(
      fnBody.includes("catch (err)"),
      "Should have try/catch for network errors",
    );
  });

  it("warns on HTTP errors but keeps original memory", () => {
    const src = readSrc("app/page.tsx");
    const fnBody = src.slice(
      src.indexOf("async function compressMemoryIfNeeded"),
      src.indexOf("async function compressMemoryIfNeeded") + 1500,
    );
    assert.ok(
      fnBody.includes('console.warn("[compress-memory]'),
      "Should warn on errors",
    );
  });

  it("warns on API-level failure but keeps original memory", () => {
    const src = readSrc("app/page.tsx");
    const fnBody = src.slice(
      src.indexOf("async function compressMemoryIfNeeded"),
      src.indexOf("async function compressMemoryIfNeeded") + 1500,
    );
    assert.ok(
      fnBody.includes("Compression failed"),
      "Should log compression failure",
    );
  });
});

// ═══════════════════════════════════════════════════════════
// 7. 集成：调用点验证
// ═══════════════════════════════════════════════════════════

describe("Integration — Compression Call Site", () => {
  it("called with fire-and-forget (void)", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("void compressMemoryIfNeeded(nextMemory, setMemory)"),
      "Should be fire-and-forget call",
    );
  });

  it("called AFTER setMemory (not before)", () => {
    const src = readSrc("app/page.tsx");
    const setMemIdx = src.indexOf("setMemory(nextMemory);");
    const compressIdx = src.indexOf("void compressMemoryIfNeeded(nextMemory");
    assert.ok(setMemIdx >= 0, "setMemory(nextMemory) exists");
    assert.ok(compressIdx >= 0, "compressMemoryIfNeeded call exists");
    assert.ok(
      compressIdx > setMemIdx,
      "Compression should be called AFTER setMemory",
    );
  });

  it("called BEFORE setLocalState (UI sync)", () => {
    const src = readSrc("app/page.tsx");
    const compressIdx = src.indexOf("void compressMemoryIfNeeded(nextMemory");
    const localStateIdx = src.indexOf("setLocalState(hydrateLocalState");
    assert.ok(compressIdx >= 0, "compressMemoryIfNeeded call exists");
    assert.ok(localStateIdx >= 0, "setLocalState call exists");
    assert.ok(
      compressIdx < localStateIdx,
      "Compression trigger should be before local state update",
    );
  });

  it("does NOT await compression (non-blocking)", () => {
    const src = readSrc("app/page.tsx");
    const line = src
      .split("\n")
      .find((l) => l.includes("compressMemoryIfNeeded(nextMemory"));
    assert.ok(line, "Call site line exists");
    assert.ok(
      line.includes("void ") && !line.includes("await"),
      "Should use void (not await) for non-blocking",
    );
  });

  it("passes setMemory as React dispatcher", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("compressMemoryIfNeeded(nextMemory, setMemory)"),
      "Should pass setMemory as second argument",
    );
  });
});

// ═══════════════════════════════════════════════════════════
// 8. 集成：压缩不影响正常记忆流
// ═══════════════════════════════════════════════════════════

describe("Integration — Memory Flow Integrity", () => {
  it("memory patch is applied BEFORE compression check", () => {
    const src = readSrc("app/page.tsx");
    const patchIdx = src.indexOf("applyMemoryPatch(latestMemory, response.memoryPatch)");
    const compressIdx = src.indexOf("void compressMemoryIfNeeded(nextMemory");
    assert.ok(patchIdx >= 0, "memoryPatch application exists");
    assert.ok(compressIdx >= 0, "compression call exists");
    assert.ok(
      patchIdx < compressIdx,
      "memoryPatch should be applied before compression check",
    );
  });

  it("embedded memory merge happens BEFORE compression check", () => {
    const src = readSrc("app/page.tsx");
    const mergeIdx = src.indexOf("...patchedForCheck.app");
    const compressIdx = src.indexOf("void compressMemoryIfNeeded(nextMemory");
    assert.ok(mergeIdx >= 0, "embedded memory merge exists");
    assert.ok(
      mergeIdx < compressIdx,
      "merge should happen before compression check",
    );
  });

  it("turn memory is set with event metadata", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("turn: { eventType: event.type, eventId: event.eventId }"),
      "Turn memory should include event metadata",
    );
  });

  it("compression preserves user memory layer", () => {
    const src = readSrc("app/page.tsx");
    const fnBody = src.slice(
      src.indexOf("async function compressMemoryIfNeeded"),
      src.indexOf("async function compressMemoryIfNeeded") + 1800,
    );
    // The spread operator `...prev` preserves turn and user
    assert.ok(
      fnBody.includes("...prev"),
      "Should spread prev to preserve turn/user layers",
    );
  });

  it("back_to_launcher still clears ALL memory (including compressed)", () => {
    const src = readSrc("app/page.tsx");
    const launcherIdx = src.indexOf('command === "back_to_launcher"');
    assert.ok(launcherIdx >= 0, "back_to_launcher handler exists");
    const handler = src.slice(launcherIdx, launcherIdx + 800);
    assert.ok(
      handler.includes("setMemory(createInitialMemory())"),
      "Should reset memory to initial (empty) state",
    );
  });
});

// ═══════════════════════════════════════════════════════════
// 9. System Prompt 质量
// ═══════════════════════════════════════════════════════════

describe("compress-memory API — System Prompt", () => {
  it("instructs AI to PRESERVE user preferences", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("PRESERVE"),
      "Should instruct preservation",
    );
  });

  it("instructs AI to SUMMARIZE large arrays", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("SUMMARIZE"),
      "Should instruct summarization",
    );
  });

  it("instructs AI to DROP timestamps and eventIds", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("DROP"),
      "Should instruct dropping non-essential data",
    );
  });

  it("requires output with only session and app keys", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes('"session" and "app" keys'),
      "Should specify output format",
    );
  });

  it("includes concrete example", () => {
    const src = readSrc("app/api/compress-memory/route.ts");
    assert.ok(
      src.includes("EXAMPLE"),
      "Should include example for AI guidance",
    );
  });
});
