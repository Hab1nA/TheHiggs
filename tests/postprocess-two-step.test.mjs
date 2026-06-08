/**
 * 两步后处理功能模块测试
 *
 * 测试内容：
 * 1. postProcessUI.ts 函数导出和类型完整性
 * 2. 三种 prompt builder 的结构验证
 * 3. runtime.ts 两步调用链的集成逻辑
 * 4. 错误处理和降级策略
 * 5. JSON output 模式验证
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

/** 读取源文件内容 */
function readSrc(relativePath) {
  return readFileSync(join(root, relativePath), "utf-8");
}

// ============================================================
// 模块结构验证
// ============================================================

test("postProcessUI.ts exports polishOrConsistencyReview and functionalityReview", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  // 导出函数存在
  assert.ok(
    src.includes("export async function polishOrConsistencyReview"),
    "Should export polishOrConsistencyReview",
  );
  assert.ok(
    src.includes("export async function functionalityReview"),
    "Should export functionalityReview",
  );

  // 类型导出存在
  assert.ok(
    src.includes("export interface PostProcessInput"),
    "Should export PostProcessInput interface",
  );
  assert.ok(
    src.includes("export interface PostProcessOutput"),
    "Should export PostProcessOutput interface",
  );
});

test("postProcessUI.ts uses generateObject with JSON mode (not generateText)", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  // 应该使用 generateObject
  assert.ok(
    src.includes('import { generateObject } from "ai"'),
    "Should import generateObject from ai",
  );
  assert.ok(
    src.includes("const result = await generateObject({"),
    "Should call generateObject",
  );

  // 不应该使用 generateText
  assert.ok(
    !src.includes("import { generateText }"),
    "Should NOT import generateText",
  );
  assert.ok(
    !src.includes("await generateText("),
    "Should NOT call generateText",
  );

  // 应该使用 mode: "json"
  assert.ok(src.includes('mode: "json"'), "Should use mode: json");

  // 应该定义 Zod schema
  assert.ok(
    src.includes("const postProcessOutputSchema = z"),
    "Should define postProcessOutputSchema with Zod",
  );
});

test("postProcessUI.ts does NOT have extractJSON or isValidUINode helper functions", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  // 旧的 JSON 解析函数应该被删除
  assert.ok(
    !src.includes("function extractJSON("),
    "Should NOT have extractJSON function",
  );
  assert.ok(
    !src.includes("function isValidUINode("),
    "Should NOT have isValidUINode function",
  );
});

test("postProcessUI.ts does NOT export old postProcessUIState function", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    !src.includes("export async function postProcessUIState"),
    "Should NOT export old postProcessUIState function",
  );
  assert.ok(
    !src.includes("function buildPostProcessSystemPrompt"),
    "Should NOT have old buildPostProcessSystemPrompt function",
  );
});

// ============================================================
// Prompt Builder 结构验证
// ============================================================

test("Visual Polish prompt has 6 review dimensions", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  // 6 个审查维度
  assert.ok(
    src.includes("REVIEW 1: ALIGNMENT & GRID CONSISTENCY"),
    "Should have alignment review",
  );
  assert.ok(
    src.includes("REVIEW 2: SPACING & BREATHING ROOM"),
    "Should have spacing review",
  );
  assert.ok(
    src.includes("REVIEW 3: VISUAL HIERARCHY"),
    "Should have hierarchy review",
  );
  assert.ok(
    src.includes("REVIEW 4: STYLE CONSISTENCY"),
    "Should have style consistency review",
  );
  assert.ok(
    src.includes("REVIEW 5: LAYOUT PATTERN APPROPRIATENESS"),
    "Should have layout pattern review",
  );
  assert.ok(
    src.includes("REVIEW 6: STRUCTURAL CLEANLINESS"),
    "Should have structural cleanliness review",
  );
});

test("Visual Polish prompt allows structural nodes but forbids functional nodes", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes("You MAY add STRUCTURAL nodes"),
    "Should allow structural nodes",
  );
  assert.ok(
    src.includes("You MUST NOT add FUNCTIONAL nodes"),
    "Should forbid functional nodes",
  );
  assert.ok(
    src.includes(
      "button, text_input, number_input, textarea, select, checkbox, slider, stepper",
    ),
    "Should list forbidden functional node types",
  );
});

test("Consistency prompt has 4 consistency checks", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes("CHECK 1: ID-BASED POSITION STABILITY"),
    "Should have position stability check",
  );
  assert.ok(
    src.includes("CHECK 2: LAYOUT MODE INHERITANCE"),
    "Should have layout mode inheritance check",
  );
  assert.ok(
    src.includes("CHECK 3: VISUAL STYLE INHERITANCE"),
    "Should have visual style inheritance check",
  );
  assert.ok(
    src.includes("CHECK 4: USER DATA PRESERVATION"),
    "Should have user data preservation check",
  );
});

test("Functionality Audit prompt has 4 checks including timer_refresh detection", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes("CHECK 1: BUTTON COMPLETENESS"),
    "Should have button completeness check",
  );
  assert.ok(
    src.includes("CHECK 2: INPUT NODE COMPLETENESS"),
    "Should have input node completeness check",
  );
  assert.ok(
    src.includes("CHECK 3: TIMER REFRESH DETECTION"),
    "Should have timer refresh detection",
  );
  assert.ok(
    src.includes("CHECK 4: SEMANTIC-TYPE MATCHING"),
    "Should have semantic-type matching check",
  );
});

test("Functionality Audit prompt forbids layout changes", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes(
      "You MUST NOT rearrange layout, move nodes, add structural containers, or change spacing",
    ),
    "Should forbid layout changes in functionality audit",
  );
});

// ============================================================
// Prompt 模式选择逻辑
// ============================================================

test("polishOrConsistencyReview selects Visual Polish when previousUI is null", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes("const isFirstGeneration = input.previousUI === null"),
    "Should check if previousUI is null",
  );
  assert.ok(
    src.includes(
      'console.log("[PostProcess:Step1] Mode: Visual Polish (first generation)")',
    ),
    "Should log Visual Polish mode",
  );
  assert.ok(
    src.includes("16000, // 首次生成内容量大"),
    "Should use 16000 maxTokens for first generation",
  );
});

test("polishOrConsistencyReview selects Consistency when previousUI exists", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes("Layout Consistency (subsequent generation)"),
    "Should log Layout Consistency mode",
  );
  assert.ok(
    src.includes("12000,"),
    "Should use 12000 maxTokens for subsequent generation",
  );
});

// ============================================================
// runtime.ts 集成逻辑验证
// ============================================================

test("runtime.ts imports new two-step functions", () => {
  const src = readSrc("src/ai/runtime.ts");

  assert.ok(
    src.includes("polishOrConsistencyReview"),
    "Should import polishOrConsistencyReview",
  );
  assert.ok(
    src.includes("functionalityReview"),
    "Should import functionalityReview",
  );
  assert.ok(
    src.includes('"./postProcessUI"'),
    "Should import from postProcessUI module",
  );
  assert.ok(
    !src.includes("postProcessUIState"),
    "Should NOT import old postProcessUIState",
  );
});

test("runtime.ts Step 3 calls Step 1 then Step 2", () => {
  const src = readSrc("src/ai/runtime.ts");

  // Step 1 调用
  assert.ok(
    src.includes("const step1Result = await polishOrConsistencyReview("),
    "Should call Step 1 (polishOrConsistencyReview)",
  );

  // Step 2 调用
  assert.ok(
    src.includes("const step2Result = await functionalityReview("),
    "Should call Step 2 (functionalityReview)",
  );

  // 两步都使用 pageLogContext
  assert.ok(
    src.includes("pageLogContext,") &&
      src.match(/pageLogContext,/g).length >= 2,
    "Should pass pageLogContext to both steps",
  );
});

test("runtime.ts implements cascading error handling", () => {
  const src = readSrc("src/ai/runtime.ts");

  // Step 1 失败时继续到 Step 2
  assert.ok(
    src.includes("const uiForStep2 = step1Result.ok"),
    "Should check step1 result before passing to step2",
  );
  assert.ok(
    src.includes("? step1Result.correctedUI"),
    "Should use step1 output when successful",
  );
  assert.ok(
    src.includes(": response.next.ui"),
    "Should fallback to original UI when step1 fails",
  );

  // Step 2 失败时使用 Step 1 结果
  assert.ok(
    src.includes("const finalUI = step2Result.ok"),
    "Should check step2 result for final UI",
  );
  assert.ok(
    src.includes("? step2Result.correctedUI"),
    "Should use step2 output when successful",
  );
  assert.ok(
    src.includes(": uiForStep2"),
    "Should fallback to step1 output when step2 fails",
  );
});

test("runtime.ts aggregates changes from both steps", () => {
  const src = readSrc("src/ai/runtime.ts");

  assert.ok(
    src.includes("const allChanges: string[] = step1Result.ok"),
    "Should initialize allChanges array",
  );
  assert.ok(
    src.includes("allChanges.push(...step2Result.changes)"),
    "Should append step2 changes to allChanges",
  );
  assert.ok(
    src.includes(
      "Post-process complete: ${allChanges.length} total fix(es) applied",
    ),
    "Should log total changes count",
  );
});

test("runtime.ts validates final UI against AUIR schema", () => {
  const src = readSrc("src/ai/runtime.ts");

  assert.ok(
    src.includes("const originalUI = response.next.ui"),
    "Should save original UI before validation",
  );
  assert.ok(
    src.includes("const ppValidation = validateResponse("),
    "Should validate against AUIR schema",
  );
  assert.ok(
    src.includes("response.next.ui = originalUI"),
    "Should revert on validation failure",
  );
  assert.ok(
    src.includes("runtime.post_process.schema_rejected"),
    "Should log schema rejection event",
  );
});

// ============================================================
// 共享组件参考验证
// ============================================================

test("Postprocess prompts use shared constants (minimal + full)", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes("const COMPONENT_REFERENCE = `"),
    "Should define shared COMPONENT_REFERENCE constant (minimal subset for prompts)",
  );
  assert.ok(
    src.includes("const FULL_COMPONENT_REFERENCE = `"),
    "Should define full component reference for audits",
  );
  assert.ok(
    src.includes("OUTPUT_FORMAT_INSTRUCTIONS"),
    "Should define shared output format instructions",
  );

  // Minimal reference should include structural/interactive core types
  const minimalTypes = [
    "screen",
    "container",
    "grid",
    "split",
    "region",
    "panel",
    "tabs",
    "button",
    "text_input",
    "select",
    "checkbox",
    "slider",
    "timer_refresh",
  ];
  for (const nodeType of minimalTypes) {
    assert.ok(
      src.includes(`  ${nodeType}`),
      `COMPONENT_REFERENCE should include ${nodeType}`,
    );
  }

  // Full reference should include extended/audit-relevant types
  const fullTypes = [
    "card",
    "kpi_card",
    "stat_group",
    "progress",
    "timer_refresh",
    "alert",
    "metric",
    "image",
  ];
  for (const nodeType of fullTypes) {
    assert.ok(
      src.includes(`  ${nodeType} {`),
      `FULL_COMPONENT_REFERENCE should include ${nodeType}`,
    );
  }
});

// ============================================================
// 日志 Stage 验证
// ============================================================

test("RuntimeLogStage includes new post-process stages", () => {
  const src = readSrc("src/runtime/logging/types.ts");

  assert.ok(
    src.includes('"visual_polish"'),
    "Should include visual_polish stage",
  );
  assert.ok(
    src.includes('"consistency_review"'),
    "Should include consistency_review stage",
  );
  assert.ok(
    src.includes('"functionality_review"'),
    "Should include functionality_review stage",
  );
});

// ============================================================
// Prompt 内容质量检查
// ============================================================

test("Visual Polish prompt includes specific gap guidance", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes('gap="xs" or gap="sm"'),
    "Should specify compact gap values",
  );
  assert.ok(src.includes('gap="md"'), "Should specify normal gap value");
  assert.ok(src.includes('gap="lg"'), "Should specify spacious gap value");
});

test("Visual Polish prompt includes layout pattern recommendations", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes("DASHBOARD (multiple KPIs/metrics) → Use grid"),
    "Should recommend grid for dashboards",
  );
  assert.ok(
    src.includes("TOOL (input + results) → Use split(horizontal)"),
    "Should recommend split for tools",
  );
  assert.ok(
    src.includes(
      "CONTENT DISPLAY (encyclopedia/articles) → Use region(header/main)",
    ),
    "Should recommend region for content",
  );
});

test("Consistency prompt preserves user inputs across turns", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes(
      "INPUT VALUES: If the previous UI had input nodes with specific values or bindings",
    ),
    "Should preserve input values",
  );
  assert.ok(
    src.includes(
      "SELECTION STATE: If the previous UI had a select/checkbox with a specific value",
    ),
    "Should preserve selection state",
  );
  assert.ok(
    src.includes("ACTIVE TAB: If the previous UI had a specific activeTab"),
    "Should preserve active tab",
  );
});

test("Functionality Audit prompt includes comprehensive button checks", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes('"intent" field MUST exist'),
    "Should require intent field",
  );
  assert.ok(
    src.includes('"variant" field MUST exist'),
    "Should require variant field",
  );
  assert.ok(
    src.includes('"interaction" field MUST exist'),
    "Should require interaction field",
  );
  assert.ok(
    src.includes('variant="primary"'),
    "Should specify primary variant for main actions",
  );
  assert.ok(
    src.includes('variant="secondary"'),
    "Should specify secondary variant for less important actions",
  );
});

test("Functionality Audit prompt has timer_refresh loading patterns", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes('"AI 正在思考"'),
    "Should include Chinese loading pattern",
  );
  assert.ok(
    src.includes('"正在加载"'),
    "Should include Chinese loading pattern",
  );
  assert.ok(
    src.includes('"AI is thinking"'),
    "Should include English loading pattern",
  );
  assert.ok(
    src.includes('"Loading"'),
    "Should include English loading pattern",
  );
});

// ============================================================
// 结构整洁度规则验证
// ============================================================

test("Visual Polish enforces max 5 levels of nesting", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes("NESTING DEPTH: No more than 5 levels of container nesting"),
    "Should enforce max 5 levels nesting",
  );
});

test("Visual Polish removes empty containers", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes(
      "EMPTY CONTAINERS: container/grid/panel with children=[] should be REMOVED",
    ),
    "Should remove empty containers",
  );
});

test("Visual Polish handles single-child containers", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes("SINGLE-CHILD CONTAINERS: A container with only 1 child"),
    "Should handle single-child containers",
  );
});

// ============================================================
// 代码质量检查
// ============================================================

test("postProcessUI.ts has proper file header documentation", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes(
      "// ============================================================",
    ),
    "Should have section separator",
  );
  assert.ok(
    src.includes("// AI Post-Process Mode — 两步 UI 审查与修正"),
    "Should have file title",
  );
  assert.ok(
    src.includes("Step 1: Visual Polish / Layout Consistency"),
    "Should describe Step 1",
  );
  assert.ok(
    src.includes("Step 2: Functionality Audit"),
    "Should describe Step 2",
  );
});

test("postProcessUI.ts has shared runReviewAI helper function", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes("async function runReviewAI("),
    "Should have shared runReviewAI function",
  );
  assert.ok(
    src.includes("两步共用此逻辑，避免重复代码"),
    "Should document shared function purpose",
  );
});

test("postProcessUI.ts uses consistent log stage names", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  assert.ok(
    src.includes("[PostProcess:${stage}] Starting review"),
    "Should use dynamic stage in log messages",
  );
  assert.ok(
    src.includes("[PostProcess:${stage}] Done:"),
    "Should use dynamic stage in completion log",
  );
});

console.log("\n✅ 两步后处理模块测试套件已定义\n");
