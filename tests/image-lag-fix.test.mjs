// ============================================================
// Search Override & Image Lag Fix — 集成测试
// ============================================================
// 覆盖：
//   1. System prompt 包含搜索覆盖规则 (CP-1)
//   2. 前端 perform_search 事件清除旧 session 状态 (CP-2)
//   3. 搜索事件时重置 imageBindings (CP-3)
//   4. Phase 1 工具决策补充 searchQuery (CP-4)
//   5. 非搜索事件不受影响
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
// CP-1: System Prompt 搜索覆盖规则
// ═══════════════════════════════════════════════════════════

describe("CP-1: System Prompt — Search Override Rules", () => {
  it("prompt.ts contains SEARCH OVERRIDE RULES section", () => {
    const src = readSrc("src/auir/prompt.ts");
    assert.ok(
      src.includes("SEARCH OVERRIDE RULES"),
      "Should have SEARCH OVERRIDE RULES section header",
    );
  });

  it("defines perform_search as a search-like event", () => {
    const src = readSrc("src/auir/prompt.ts");
    assert.ok(
      src.includes('"perform_search"'),
      "Should mention perform_search intent",
    );
  });

  it("defines app.search as a search-like event", () => {
    const src = readSrc("src/auir/prompt.ts");
    assert.ok(
      src.includes('"app.search"'),
      "Should mention app.search event type",
    );
  });

  it("instructs AI NOT to create comparison panels", () => {
    const src = readSrc("src/auir/prompt.ts");
    assert.ok(
      src.includes("comparison panel"),
      "Should explicitly forbid comparison panels",
    );
  });

  it("instructs AI NOT to reuse images from previous turns", () => {
    const src = readSrc("src/auir/prompt.ts");
    assert.ok(
      src.includes("do NOT reuse images from previous turns"),
      "Should forbid reusing old images",
    );
  });

  it("declares old imageBindings as OBSOLETE", () => {
    const src = readSrc("src/auir/prompt.ts");
    assert.ok(
      src.includes("OBSOLETE after a new search"),
      "Should declare old imageBindings obsolete",
    );
  });

  it("includes go_back_to_search rule", () => {
    const src = readSrc("src/auir/prompt.ts");
    assert.ok(
      src.includes("go_back_to_search"),
      "Should handle go_back_to_search intent",
    );
  });
});

// ═══════════════════════════════════════════════════════════
// CP-2 + CP-3: 前端搜索事件清理
// ═══════════════════════════════════════════════════════════

describe("CP-2: Frontend — Search clears stale session state", () => {
  it("page.tsx detects perform_search as search event", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes('intent === "perform_search"'),
      "Should detect perform_search intent",
    );
  });

  it("page.tsx detects app.search as search event", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes('event.type === "app.search"'),
      "Should detect app.search event type",
    );
  });

  it("clears comparisonMode for search events", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("comparisonMode: undefined"),
      "Should clear comparisonMode",
    );
  });

  it("clears selectedEntry for search events", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("selectedEntry: undefined"),
      "Should clear selectedEntry",
    );
  });

  it("uses effectiveMemory variable (not raw memory) in request", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("memory: effectiveMemory"),
      "Request should use effectiveMemory, not raw memory",
    );
  });
});

describe("CP-3: Frontend — Search clears imageBindings", () => {
  it("clears imageBindings for search events", () => {
    const src = readSrc("app/page.tsx");
    assert.ok(
      src.includes("imageBindings: undefined"),
      "Should clear imageBindings for search events",
    );
  });

  it("imageBindings clearing is inside the isSearchEvent branch", () => {
    const src = readSrc("app/page.tsx");
    // The imageBindings: undefined should appear AFTER the isSearchEvent check
    const isSearchIdx = src.indexOf("isSearchEvent");
    const bindingsIdx = src.indexOf("imageBindings: undefined");
    assert.ok(isSearchIdx >= 0, "isSearchEvent check exists");
    assert.ok(bindingsIdx >= 0, "imageBindings: undefined exists");
    assert.ok(
      bindingsIdx > isSearchIdx,
      "imageBindings clearing should be after isSearchEvent check",
    );
  });

  it("non-search events still use original memory", () => {
    const src = readSrc("app/page.tsx");
    // The ternary: isSearchEvent ? effective : latestMemory
    assert.ok(
      src.includes(": latestMemory;") || src.includes(": latestMemory\n"),
      "Non-search events should fall through to latestMemory",
    );
  });
});

// ═══════════════════════════════════════════════════════════
// CP-4: Phase 1 工具决策补充搜索上下文
// ═══════════════════════════════════════════════════════════

describe("CP-4: Tool Decision — searchQuery context", () => {
  it("eventSummary includes searchQuery for perform_search events", () => {
    const src = readSrc("src/ai/generateNextState.ts");
    assert.ok(
      src.includes("searchQuery"),
      "eventSummary should have searchQuery field",
    );
    assert.ok(
      src.includes("perform_search"),
      "searchQuery should be populated for perform_search intent",
    );
  });

  it("searchQuery falls back to clientSnapshot values", () => {
    const src = readSrc("src/ai/generateNextState.ts");
    assert.ok(
      src.includes("clientSnapshot?.localState?.values?.searchQuery"),
      "Should fallback to clientSnapshot searchQuery",
    );
  });

  it("tool decision system prompt mentions perform_search rule", () => {
    const src = readSrc("src/ai/generateNextState.ts");
    // Find the SPECIAL RULES FOR component.click section
    assert.ok(
      src.includes('"perform_search" and a "searchQuery"'),
      "Tool decision prompt should mention perform_search with searchQuery",
    );
  });

  it("tool decision prompt says to generate fresh imageBlueprint", () => {
    const src = readSrc("src/ai/generateNextState.ts");
    assert.ok(
      src.includes("COMPLETELY FRESH imageBlueprint"),
      "Should instruct fresh imageBlueprint for new searches",
    );
  });
});

// ═══════════════════════════════════════════════════════════
// 非搜索事件不受影响
// ═══════════════════════════════════════════════════════════

describe("Non-search events — Unaffected", () => {
  it("component.click with non-search intent uses raw memory", () => {
    const src = readSrc("app/page.tsx");
    // isSearchEvent only true for perform_search, not other intents
    // So e.g. "Switch tab" would use raw memory
    const searchCheck = src.indexOf("isSearchEvent");
    assert.ok(searchCheck >= 0, "isSearchEvent exists");
    // The condition only matches perform_search, not all clicks
    assert.ok(
      src.includes('intent === "perform_search"'),
      "Only perform_search triggers the override",
    );
  });

  it("imageBindings preserved for non-search events", () => {
    const src = readSrc("app/page.tsx");
    // The ternary ensures non-search uses latestMemory (with imageBindings)
    const ternary = src.indexOf("isSearchEvent");
    const memRef = src.indexOf(": latestMemory;", ternary);
    assert.ok(
      memRef > ternary,
      "Non-search events should use latestMemory (preserving imageBindings)",
    );
  });
});

// ═══════════════════════════════════════════════════════════
// Backend: sanitizeSearchMemory in runtime.ts
// ═══════════════════════════════════════════════════════════

describe("Backend sanitizeSearchMemory — Runtime.ts", () => {
  it("sanitizeSearchMemory function is defined", () => {
    const src = readSrc("src/ai/runtime.ts");
    assert.ok(
      src.includes("function sanitizeSearchMemory("),
      "sanitizeSearchMemory should be defined in runtime.ts",
    );
  });

  it("sanitizeSearchMemory is called at the start of runAIRuntime", () => {
    const src = readSrc("src/ai/runtime.ts");
    const runIdx = src.indexOf("export async function runAIRuntime(");
    const sanitizeIdx = src.indexOf("sanitizeSearchMemory(request);");
    assert.ok(runIdx >= 0, "runAIRuntime exists");
    assert.ok(sanitizeIdx >= 0, "sanitizeSearchMemory is called");
    assert.ok(
      sanitizeIdx > runIdx && sanitizeIdx < runIdx + 300,
      "sanitizeSearchMemory should be called near the start of runAIRuntime",
    );
  });

  it("deletes comparisonMode from session memory", () => {
    const src = readSrc("src/ai/runtime.ts");
    assert.ok(
      src.includes("delete request.memory.session.comparisonMode"),
      "Should delete comparisonMode from session",
    );
  });

  it("deletes selectedEntry from session memory", () => {
    const src = readSrc("src/ai/runtime.ts");
    assert.ok(
      src.includes("delete request.memory.session.selectedEntry"),
      "Should delete selectedEntry from session",
    );
  });

  it("deletes imageBindings from app memory", () => {
    const src = readSrc("src/ai/runtime.ts");
    assert.ok(
      src.includes("delete request.memory.app.imageBindings"),
      "Should delete imageBindings from app",
    );
  });

  it("detects perform_search intent as search event", () => {
    const src = readSrc("src/ai/runtime.ts");
    assert.ok(
      src.includes('intent === "perform_search"'),
      "Should detect perform_search intent",
    );
  });

  it("detects app.search as search event", () => {
    const src = readSrc("src/ai/runtime.ts");
    assert.ok(
      src.includes('request.event.type === "app.search"'),
      "Should detect app.search event type",
    );
  });

  it("returns early for non-search events (no cleanup)", () => {
    const src = readSrc("src/ai/runtime.ts");
    const fnBody = src.slice(
      src.indexOf("function sanitizeSearchMemory"),
      src.indexOf("function sanitizeSearchMemory") + 500,
    );
    assert.ok(
      fnBody.includes("if (!isSearchEvent) return"),
      "Should return early for non-search events",
    );
  });

  it("preserves non-stale session keys (postProcess, currentTask, etc.)", () => {
    const src = readSrc("src/ai/runtime.ts");
    const fnBody = src.slice(
      src.indexOf("function sanitizeSearchMemory"),
      src.indexOf("function sanitizeSearchMemory") + 500,
    );
    // Only comparisonMode and selectedEntry are deleted — other keys remain
    assert.ok(
      fnBody.includes("delete request.memory.session.comparisonMode"),
      "Only comparisonMode is deleted",
    );
    assert.ok(
      fnBody.includes("delete request.memory.session.selectedEntry"),
      "Only selectedEntry is deleted",
    );
    // postProcess, currentTask, etc. are NOT deleted
    assert.ok(
      !fnBody.includes("delete request.memory.session.postProcess"),
      "postProcess should NOT be deleted",
    );
  });
});
