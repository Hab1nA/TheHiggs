// ============================================================
// Double Refine Fix — 回归测试
// ============================================================
// 验证 runtime.ts 在 event 已携带 refinedPrompt + refinedContext 时
// 不再重复调用 refineUserQuery()，避免双重 Refine Bug。
//
// 背景：
//   前端 SearchLauncher 先调 POST /api/refine 获取细化结果，
//   然后将结果嵌入 app.search 事件。后端 runtime.ts 之前不检查
//   event 中是否已有 refine 结果，导致重复调用 refineUserQuery()，
//   第二次调用可能失败并丢失所有 refine 数据。
// ============================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readSrc(relativePath) {
  return readFileSync(join(root, relativePath), "utf-8");
}

// -----------------------------------------------------------
// 1. runtime.ts 包含前端 refine 复用逻辑
// -----------------------------------------------------------

test("runtime.ts checks for frontend refinedPrompt before calling refineUserQuery", () => {
  const src = readSrc("src/ai/runtime.ts");

  assert.ok(
    src.includes("request.event.refinedPrompt"),
    "runtime.ts should check request.event.refinedPrompt before refine",
  );
  assert.ok(
    src.includes("request.event.refinedContext"),
    "runtime.ts should check request.event.refinedContext before refine",
  );
});

test("runtime.ts reuses frontend refine result when available (no second LLM call)", () => {
  const src = readSrc("src/ai/runtime.ts");

  // Should construct RefineOutput from frontend data
  assert.ok(
    src.includes("Reusing frontend refine result"),
    "runtime.ts should log when reusing frontend refine result",
  );

  // Should map refinedContext fields to RefineOutput
  assert.ok(
    src.includes("ctx.appTitle"),
    "Should map refinedContext.appTitle to RefineOutput",
  );
  assert.ok(
    src.includes("ctx.appKind"),
    "Should map refinedContext.appKind to RefineOutput",
  );
  assert.ok(
    src.includes("ctx.keyFeatures"),
    "Should map refinedContext.keyFeatures to RefineOutput",
  );
  assert.ok(
    src.includes("ctx.suggestedLayout"),
    "Should map refinedContext.suggestedLayout to RefineOutput",
  );
  assert.ok(
    src.includes("ctx.suggestedComponents"),
    "Should map refinedContext.suggestedComponents to RefineOutput",
  );

  // Should set uiModules to empty array (frontend refine doesn't include modules)
  assert.ok(
    src.includes("uiModules: []"),
    "Should set uiModules to empty array for frontend refine results",
  );
});

test("runtime.ts only calls refineUserQuery when no frontend result exists", () => {
  const src = readSrc("src/ai/runtime.ts");

  // The backend refine call should be in an else branch
  // Find the pattern: check for refinedPrompt first, then else -> refineUserQuery
  const hasFrontendCheck = src.includes("request.event.refinedPrompt &&");
  const hasBackendFallback = src.includes(
    "refineResult = await refineUserQuery(",
  );

  assert.ok(hasFrontendCheck, "Should check for frontend refinedPrompt");
  assert.ok(
    hasBackendFallback,
    "Should still call refineUserQuery as fallback when no frontend result",
  );
});

// -----------------------------------------------------------
// 2. 前端 SearchLauncher 正确传递 refine 结果
// -----------------------------------------------------------

test("SearchLauncher.tsx passes refinedPrompt and refinedContext in event", () => {
  const src = readSrc("src/components/SearchLauncher.tsx");

  assert.ok(
    src.includes("refinedPrompt: data.refinedPrompt"),
    "SearchLauncher should pass refinedPrompt from API response",
  );
  assert.ok(
    src.includes("refinedContext:"),
    "SearchLauncher should pass refinedContext in event",
  );
  assert.ok(
    src.includes("appKind: data.appKind"),
    "refinedContext should include appKind",
  );
  assert.ok(
    src.includes("appTitle: data.appTitle"),
    "refinedContext should include appTitle",
  );
  assert.ok(
    src.includes("keyFeatures: data.keyFeatures"),
    "refinedContext should include keyFeatures",
  );
});

test("SearchLauncher.tsx calls /api/refine before creating search event", () => {
  const src = readSrc("src/components/SearchLauncher.tsx");

  assert.ok(
    src.includes('fetch("/api/refine"'),
    "SearchLauncher should call /api/refine endpoint",
  );
  assert.ok(
    src.includes("refine: true"),
    "SearchLauncher should set refine: true in event after successful refine",
  );
});

// -----------------------------------------------------------
// 3. 独立 /api/refine 端点仍正常工作
// -----------------------------------------------------------

test("/api/refine route calls refineUserQuery independently", () => {
  const src = readSrc("app/api/refine/route.ts");

  assert.ok(
    src.includes("refineUserQuery("),
    "/api/refine should call refineUserQuery",
  );
  assert.ok(
    src.includes("ok: true"),
    "/api/refine should return ok: true on success",
  );
  assert.ok(
    src.includes("ok: false"),
    "/api/refine should return ok: false on failure",
  );
});

// -----------------------------------------------------------
// 4. RefineOutput 类型兼容性
// -----------------------------------------------------------

test("refinePrompt.ts exports RefineOutput type", () => {
  const src = readSrc("src/ai/refinePrompt.ts");

  assert.ok(
    src.includes("export type RefineOutput"),
    "refinePrompt.ts should export RefineOutput type",
  );
  assert.ok(
    src.includes("export async function refineUserQuery"),
    "refinePrompt.ts should export refineUserQuery function",
  );
});

test("refinePrompt.ts RefineOutput has all required fields", () => {
  const src = readSrc("src/ai/refinePrompt.ts");

  const requiredFields = [
    "refinedPrompt",
    "appKind",
    "appTitle",
    "appDescription",
    "keyFeatures",
    "suggestedLayout",
    "suggestedComponents",
    "uiModules",
  ];

  for (const field of requiredFields) {
    assert.ok(
      src.includes(`${field}:`) || src.includes(`"${field}"`),
      `RefineOutput schema should include field: ${field}`,
    );
  }
});

// -----------------------------------------------------------
// 5. Event 类型包含 refinedPrompt 和 refinedContext
// -----------------------------------------------------------

test("AppSearchEvent type includes refinedPrompt and refinedContext", () => {
  const src = readSrc("src/auir/types.ts");

  assert.ok(
    src.includes("refinedPrompt?: string"),
    "AppSearchEvent should have refinedPrompt field",
  );
  assert.ok(
    src.includes("refinedContext?:"),
    "AppSearchEvent should have refinedContext field",
  );
});

test("createAppSearchEvent accepts refinedPrompt and refinedContext options", () => {
  const src = readSrc("src/runtime/event.ts");

  assert.ok(
    src.includes("refinedPrompt?:"),
    "createAppSearchEvent should accept refinedPrompt option",
  );
  assert.ok(
    src.includes("refinedContext?:"),
    "createAppSearchEvent should accept refinedContext option",
  );
  assert.ok(
    src.includes("refinedPrompt: opts?.refinedPrompt"),
    "createAppSearchEvent should pass refinedPrompt to event",
  );
});

// -----------------------------------------------------------
// 6. 无回归：runtime.ts 仍包含所有原有功能
// -----------------------------------------------------------

test("runtime.ts still imports refineUserQuery and RefineOutput", () => {
  const src = readSrc("src/ai/runtime.ts");

  assert.ok(
    src.includes(
      'import { refineUserQuery, type RefineOutput } from "./refinePrompt"',
    ),
    "Should still import refineUserQuery and RefineOutput",
  );
});

test("runtime.ts still has graceful degradation on refine failure", () => {
  const src = readSrc("src/ai/runtime.ts");

  assert.ok(
    src.includes("Refine step failed, falling back to direct generation"),
    "Should still have graceful degradation message",
  );
  assert.ok(
    src.includes("refineResult = undefined"),
    "Should set refineResult to undefined on failure",
  );
});

test("runtime.ts logs refine source for debugging", () => {
  const src = readSrc("src/ai/runtime.ts");

  assert.ok(
    src.includes("runtime.refine.source"),
    "Should log the refine source (frontend vs backend) for debugging",
  );
  assert.ok(
    src.includes('source: "frontend"'),
    "Should log source as frontend when reusing frontend result",
  );
});

// -----------------------------------------------------------
// 7. generateNextAUIRState 正确处理空 uiModules
// -----------------------------------------------------------

test("generateNextAUIRState checks uiModules.length > 0 before using plan", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  assert.ok(
    src.includes(
      "refineResult?.uiModules && refineResult.uiModules.length > 0",
    ),
    "Should check uiModules.length > 0 before plan-derived tool decision",
  );
});

test("generateNextAUIRState falls back to AI-driven tool decision when uiModules is empty", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  assert.ok(
    src.includes("decideToolNeeds(request)"),
    "Should fall back to decideToolNeeds when no framework plan",
  );
});

test("generateNextAUIRState still builds refinement supplement when refineResult exists", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  assert.ok(
    src.includes("buildRefinementSupplement(refineResult)"),
    "Should build refinement supplement even without uiModules",
  );
});
