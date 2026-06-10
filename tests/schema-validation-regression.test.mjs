/**
 * Regression tests for AUIR schema validation pipeline.
 *
 * Covers:
 *  1. validateOrRetry throws on double failure (not returns fallback)
 *  2. validateResponse rejects unsupported component types
 *  3. ALLOWED_COMPONENTS matches uiNodeSchema types
 *  4. Prompt/refine/postProcess prompts don't reference unsupported components
 */

import assert from "node:assert/strict";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const outDir = join(root, ".test-build");

/**
 * Compile TypeScript sources using a test-specific tsconfig.
 * Output is placed inside the project so node_modules resolves.
 */
function compileSources() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const testTsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      outDir: outDir,
      declaration: false,
      sourceMap: false,
      skipLibCheck: true,
      strict: true,
      esModuleInterop: true,
      baseUrl: root,
      paths: { "@/*": ["./src/*"] },
    },
    include: [
      "src/auir/validate.ts",
      "src/auir/schema.ts",
      "src/auir/constraints.ts",
      "src/auir/beautify.ts",
      "src/auir/fallback.ts",
      "src/auir/memory.ts",
      "src/auir/types.ts",
    ],
  };

  const tsconfigPath = join(root, "tsconfig.test.json");
  writeFileSync(tsconfigPath, JSON.stringify(testTsconfig, null, 2));

  try {
    execFileSync(
      process.execPath,
      ["node_modules/typescript/bin/tsc", "--project", tsconfigPath],
      { cwd: root, stdio: "pipe" },
    );
  } finally {
    try {
      rmSync(tsconfigPath);
    } catch {}
  }
}

async function importCompiled(relativePath) {
  const fullPath = join(outDir, relativePath);
  return import(pathToFileURL(fullPath).href);
}

// ─── Pre-compile once ────────────────────────────────────────
let validateModule;
let schemaModule;
let constraintsModule;

test.before(async () => {
  compileSources();
  // Files are compiled directly to outDir (rootDir is src/auir/)
  validateModule = await importCompiled("validate.js");
  schemaModule = await importCompiled("schema.js");
  constraintsModule = await importCompiled("constraints.js");
});

// ─── Test 1: validateOrRetry throws on double failure ────────

test("validateOrRetry throws Error (not returns fallback) when both attempts fail", async () => {
  const { validateOrRetry } = validateModule;

  const invalidGenerateFn = async () => ({
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "test", title: "Test", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: { id: "bad", type: "nonexistent_component_type" },
    },
  });

  await assert.rejects(
    () => validateOrRetry(invalidGenerateFn),
    (err) => {
      assert.ok(err instanceof Error, "Should throw an Error");
      assert.ok(
        err.message.includes("Schema validation failed after retry"),
        `Error message should mention retry failure, got: ${err.message}`,
      );
      return true;
    },
  );
});

// ─── Test 2: validateResponse rejects unsupported components ──

test("validateResponse rejects UI with unsupported component type 'toggle'", () => {
  const { validateResponse } = validateModule;

  const invalidResponse = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "test", title: "Test", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: {
        id: "root",
        type: "screen",
        children: [
          {
            id: "bad",
            type: "toggle",
            label: "Test",
            checked: false,
            binding: "test",
          },
        ],
      },
    },
  };

  const result = validateResponse(invalidResponse);
  assert.equal(result.ok, false, "Should reject toggle component");
});

test("validateResponse rejects UI with unsupported component type 'radio_group'", () => {
  const { validateResponse } = validateModule;

  const invalidResponse = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "test", title: "Test", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: {
        id: "root",
        type: "screen",
        children: [{ id: "bad", type: "radio_group" }],
      },
    },
  };

  const result = validateResponse(invalidResponse);
  assert.equal(result.ok, false, "Should reject radio_group component");
});

test("validateResponse rejects UI with unsupported component type 'chart_pie'", () => {
  const { validateResponse } = validateModule;

  const invalidResponse = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "test", title: "Test", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: {
        id: "root",
        type: "screen",
        children: [{ id: "bad", type: "chart_pie", data: [] }],
      },
    },
  };

  const result = validateResponse(invalidResponse);
  assert.equal(result.ok, false, "Should reject chart_pie component");
});

test("validateResponse accepts valid components", () => {
  const { validateResponse } = validateModule;

  const validResponse = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "test", title: "Test", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: {
        id: "root",
        type: "screen",
        children: [
          { id: "heading1", type: "heading", text: "Hello", level: 1 },
          { id: "btn1", type: "button", label: "Click", intent: "test" },
          { id: "input1", type: "text_input", binding: "name" },
          {
            id: "cb1",
            type: "checkbox",
            label: "Check",
            checked: false,
            binding: "check",
          },
        ],
      },
    },
  };

  const result = validateResponse(validResponse);
  assert.equal(
    result.ok,
    true,
    `Should accept valid response, errors: ${result.ok ? "none" : result.errors.join("; ")}`,
  );
});

// ─── Test 3: ALLOWED_COMPONENTS ↔ uiNodeSchema consistency ───

test("every ALLOWED_COMPONENTS entry has a matching uiNodeSchema type", () => {
  const { ALLOWED_COMPONENTS } = constraintsModule;
  const { uiNodeSchema } = schemaModule;

  const schemaTypes = uiNodeSchema._def.options.map(
    (opt) => opt.shape.type._def.value,
  );

  for (const comp of ALLOWED_COMPONENTS) {
    assert.ok(
      schemaTypes.includes(comp),
      `ALLOWED_COMPONENTS includes "${comp}" but uiNodeSchema has no matching type. Schema types: ${schemaTypes.join(", ")}`,
    );
  }
});

test("every uiNodeSchema type is in ALLOWED_COMPONENTS", () => {
  const { ALLOWED_COMPONENTS } = constraintsModule;
  const { uiNodeSchema } = schemaModule;

  const schemaTypes = uiNodeSchema._def.options.map(
    (opt) => opt.shape.type._def.value,
  );

  for (const type of schemaTypes) {
    assert.ok(
      ALLOWED_COMPONENTS.includes(type),
      `uiNodeSchema has type "${type}" but it's not in ALLOWED_COMPONENTS`,
    );
  }
});

// ─── Test 4: Prompt drift detection ──────────────────────────

test("refinePrompt.ts does not reference unsupported components (toggle, radio_group, chart_pie)", () => {
  const refinePath = join(root, "src/ai/refinePrompt.ts");
  const content = readFileSync(refinePath, "utf-8");

  // Component list may be omitted to avoid prompt bloat; ensure unsupported types are not referenced anywhere.
  for (const unsupported of ["toggle", "radio_group", "chart_pie"]) {
    assert.ok(
      !content.includes(unsupported),
      `refinePrompt.ts should not reference unsupported component '${unsupported}'`,
    );
  }
});

test("postProcessUI.ts does not have 'toggle' as a component definition", () => {
  const postProcessPath = join(root, "src/ai/postProcessUI.ts");
  const content = readFileSync(postProcessPath, "utf-8");

  const toggleAsComponent = /toggle\s*\{/;
  assert.ok(
    !toggleAsComponent.test(content),
    "postProcessUI.ts still has 'toggle' as a component type definition",
  );
});

test("prompt.ts JSON OUTPUT FORMAT section does not include toolRequests example", () => {
  const promptPath = join(root, "src/auir/prompt.ts");
  const content = readFileSync(promptPath, "utf-8");

  const jsonFormatSection = content.match(
    /--- JSON OUTPUT FORMAT ---([\s\S]*?)--- END JSON OUTPUT FORMAT ---/,
  );
  assert.ok(jsonFormatSection, "Could not find JSON OUTPUT FORMAT section");

  const formatContent = jsonFormatSection[1];
  // Check that toolRequests does not appear as a JSON field key ("toolRequests":)
  // It's OK if it appears in instruction text like "Do NOT include toolRequests"
  assert.ok(
    !formatContent.includes('"toolRequests":'),
    "JSON OUTPUT FORMAT section still includes toolRequests as a JSON field key",
  );
  assert.ok(
    /Do NOT.*toolRequests/i.test(formatContent),
    "JSON OUTPUT FORMAT should instruct model not to include toolRequests",
  );
});

// ─── Test 5: validateOrRetry error propagates to generateWithRetry catch ──

test("validateOrRetry Error propagates to caller (enables generateWithRetry cascade)", async () => {
  const { validateOrRetry } = validateModule;

  // This is the exact scenario from the audit report:
  // generateFn returns invalid component { type: "radio_group" }
  // After 2 internal retries, validateOrRetry should throw
  // The throw is what allows generateWithRetry to catch and proceed to attempt 2/3
  let callCount = 0;
  const invalidGenerateFn = async () => {
    callCount++;
    return {
      protocol: "AUIR",
      version: "0.3",
      next: {
        app: { id: "test", title: "Test", kind: "utility" },
        memory: { app: {}, session: {} },
        ui: { id: "bad", type: "radio_group" }, // unsupported component
      },
    };
  };

  await assert.rejects(() => validateOrRetry(invalidGenerateFn));

  // validateOrRetry should have called generateFn exactly 2 times (first + retry)
  assert.equal(
    callCount,
    2,
    `Expected 2 calls to generateFn, got ${callCount}`,
  );
});

// ─── Test 6: Mock fallback diagnostics pattern in runtime.ts ────────────────

test("runtime.ts: mock fallback injects diagnostic warning and simulatedData flag", () => {
  const runtimePath = join(root, "src/ai/runtime.ts");
  const content = readFileSync(runtimePath, "utf-8");

  // The catch block should await mockGenerateNextAUIRState (not sync call)
  assert.ok(
    content.includes(
      "const mockResponse = await mockGenerateNextAUIRState(request)",
    ),
    "Mock fallback should await mockGenerateNextAUIRState",
  );

  // Should inject diagnostic warning with error details
  assert.ok(
    content.includes("Mock fallback: real AI generation failed"),
    "Mock fallback should inject diagnostic warning",
  );

  // Should set simulatedData = true
  assert.ok(
    content.includes("mockResponse.diagnostics.simulatedData = true"),
    "Mock fallback should set simulatedData = true",
  );

  // Should initialize diagnostics object if missing
  assert.ok(
    content.includes("if (!mockResponse.diagnostics)"),
    "Mock fallback should initialize diagnostics if missing",
  );
});

// ─── Test 7: Post-process schema validation rejects invalid output ──────────

test("runtime.ts: post-process with invalid component reverts to original UI", () => {
  const runtimePath = join(root, "src/ai/runtime.ts");
  const content = readFileSync(runtimePath, "utf-8");

  // Should save original UI before applying post-process
  assert.ok(
    content.includes("const originalUI = response.next.ui"),
    "Should save original UI before post-process",
  );

  // Should validate post-process output against schema
  assert.ok(
    content.includes("const ppValidation = validateResponse("),
    "Should validate post-process output against schema",
  );

  // Should revert on validation failure
  assert.ok(
    content.includes("response.next.ui = originalUI"),
    "Should revert to original UI on post-process validation failure",
  );

  // Should log schema rejection
  assert.ok(
    content.includes("runtime.post_process.schema_rejected"),
    "Should log schema rejection event",
  );

  // On success, should use ppValidation.value (Zod-parsed clean object)
  assert.ok(
    content.includes("response = ppValidation.value"),
    "Should use Zod-parsed value on post-process validation success",
  );

  // Should beautify after successful validation
  assert.ok(
    content.includes("beautifyLayout(response.next.ui"),
    "Should beautify layout after successful post-process validation",
  );
});

// ─── Test 8: validateOrRetry calls generateFn exactly twice on failure ──────

test("validateOrRetry calls generateFn exactly twice before throwing", async () => {
  const { validateOrRetry } = validateModule;

  // Track exact call sequence
  const callLog = [];
  const trackingGenerateFn = async () => {
    callLog.push(Date.now());
    return {
      protocol: "AUIR",
      version: "0.3",
      next: {
        app: { id: "test", title: "Test", kind: "utility" },
        memory: { app: {}, session: {} },
        ui: { id: "bad", type: "chart_pie", data: [] },
      },
    };
  };

  await assert.rejects(() => validateOrRetry(trackingGenerateFn));
  assert.equal(
    callLog.length,
    2,
    "validateOrRetry should call generateFn exactly twice",
  );
});

// ─── Test 9: validateOrRetry returns valid response on second attempt ───────

test("validateOrRetry succeeds when second attempt returns valid data", async () => {
  const { validateOrRetry } = validateModule;

  let attempt = 0;
  const validResponse = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "test", title: "Test", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: { id: "root", type: "screen", children: [] },
    },
  };

  const conditionalGenerateFn = async () => {
    attempt++;
    if (attempt === 1) {
      // First attempt returns invalid
      return {
        protocol: "AUIR",
        version: "0.3",
        next: { app: {}, memory: {}, ui: { id: "bad", type: "invalid" } },
      };
    }
    // Second attempt returns valid
    return validResponse;
  };

  const result = await validateOrRetry(conditionalGenerateFn);
  assert.equal(
    result.next.app.id,
    "test",
    "Should return the valid response from second attempt",
  );
  assert.equal(attempt, 2, "Should have called generateFn twice");
});

// ─── Test 10: Response-level toolRequests are NOT consumed by generateWithRetry ──

test("generateNextState.ts: tool execution only uses Phase 1 decision, not response toolRequests", () => {
  const genPath = join(root, "src/ai/generateNextState.ts");
  const content = readFileSync(genPath, "utf-8");

  // Phase 1 tool decision should be the source of tool execution
  // Either via AI call (decideToolNeeds) or plan-derived (deriveToolDecisionFromPlan)
  const usesDecideToolNeeds = content.includes("decideToolNeeds(request)");
  const usesPlanDerived = content.includes("deriveToolDecisionFromPlan(");
  assert.ok(
    usesDecideToolNeeds || usesPlanDerived,
    "Should use Phase 1 decideToolNeeds or deriveToolDecisionFromPlan for tool decisions",
  );

  // The response-level toolRequests field should not be iterated for execution
  // Check that there's no loop like: for (const tr of response.toolRequests)
  const responseToolRequestLoops = content.match(
    /for\s*\([^)]*response\.toolRequests/g,
  );
  assert.ok(
    !responseToolRequestLoops || responseToolRequestLoops.length === 0,
    "Should not iterate response.toolRequests for tool execution",
  );
});

// ─── Test 11: repairNumericFields coerces string-quoted numbers ─────────────

test("repairNumericFields converts progress node string value/max to numbers", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "demo_progress",
        type: "progress",
        label: "进度",
        value: "70", // string — LLM type hallucination
        max: "100", // string
        tone: "primary",
      },
    ],
  };

  repairNumericFields(ui);

  const progress = ui.children[0];
  assert.equal(
    typeof progress.value,
    "number",
    "value should be number after repair",
  );
  assert.equal(progress.value, 70, "value should be 70");
  assert.equal(
    typeof progress.max,
    "number",
    "max should be number after repair",
  );
  assert.equal(progress.max, 100, "max should be 100");
});

test("repairNumericFields converts slider node string fields to numbers", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "demo_slider",
        type: "slider",
        label: "Volume",
        value: "50",
        min: "0",
        max: "100",
        step: "5",
        binding: "volume",
      },
    ],
  };

  repairNumericFields(ui);

  const slider = ui.children[0];
  assert.equal(typeof slider.value, "number");
  assert.equal(slider.value, 50);
  assert.equal(typeof slider.min, "number");
  assert.equal(slider.min, 0);
  assert.equal(typeof slider.max, "number");
  assert.equal(slider.max, 100);
  assert.equal(typeof slider.step, "number");
  assert.equal(slider.step, 5);
});

test("repairNumericFields converts number_input string fields to numbers", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "demo_num",
        type: "number_input",
        label: "Count",
        value: "42",
        min: "1",
        max: "100",
        step: "1",
        binding: "count",
      },
    ],
  };

  repairNumericFields(ui);

  const numInput = ui.children[0];
  assert.equal(typeof numInput.value, "number");
  assert.equal(numInput.value, 42);
  assert.equal(typeof numInput.min, "number");
  assert.equal(numInput.min, 1);
});

test("repairNumericFields converts stepper string fields to numbers", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "demo_stepper",
        type: "stepper",
        label: "Qty",
        value: "3",
        binding: "qty",
      },
    ],
  };

  repairNumericFields(ui);
  assert.equal(typeof ui.children[0].value, "number");
  assert.equal(ui.children[0].value, 3);
});

test("repairNumericFields converts gauge string fields to numbers", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "demo_gauge",
        type: "gauge",
        title: "CPU",
        value: "75",
        min: "0",
        max: "100",
        thresholds: [
          { color: "success", min: "0", max: "60" },
          { color: "warning", min: "60", max: "80" },
          { color: "danger", min: "80", max: "100" },
        ],
      },
    ],
  };

  repairNumericFields(ui);

  const gauge = ui.children[0];
  assert.equal(typeof gauge.value, "number");
  assert.equal(gauge.value, 75);
  assert.equal(typeof gauge.thresholds[0].min, "number");
  assert.equal(gauge.thresholds[0].min, 0);
  assert.equal(typeof gauge.thresholds[1].max, "number");
  assert.equal(gauge.thresholds[1].max, 80);
});

test("repairNumericFields converts chart_bar data values to numbers", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "demo_chart",
        type: "chart_bar",
        title: "Sales",
        data: [
          { label: "Q1", value: "100" },
          { label: "Q2", value: "200" },
        ],
      },
    ],
  };

  repairNumericFields(ui);

  const chart = ui.children[0];
  assert.equal(typeof chart.data[0].value, "number");
  assert.equal(chart.data[0].value, 100);
  assert.equal(typeof chart.data[1].value, "number");
  assert.equal(chart.data[1].value, 200);
});

test("repairNumericFields converts chart_line data y values to numbers", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "demo_line",
        type: "chart_line",
        data: [
          { x: "Jan", y: "10" },
          { x: "Feb", y: "20" },
        ],
      },
    ],
  };

  repairNumericFields(ui);

  const chart = ui.children[0];
  assert.equal(typeof chart.data[0].y, "number");
  assert.equal(chart.data[0].y, 10);
  // x can be string or number — should NOT be coerced
  assert.equal(typeof chart.data[0].x, "string");
});

test("repairNumericFields converts timer_refresh seconds to number", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "timer",
        type: "timer_refresh",
        seconds: "5",
        message: "Loading...",
        showProgress: true,
      },
    ],
  };

  repairNumericFields(ui);
  assert.equal(typeof ui.children[0].seconds, "number");
  assert.equal(ui.children[0].seconds, 5);
});

test("repairNumericFields converts heading level to number", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [{ id: "h", type: "heading", text: "Title", level: "2" }],
  };

  repairNumericFields(ui);
  assert.equal(typeof ui.children[0].level, "number");
  assert.equal(ui.children[0].level, 2);
});

test("repairNumericFields converts steps.current to number", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "demo_steps",
        type: "steps",
        current: "2",
        items: [
          { id: "s1", title: "Step 1" },
          { id: "s2", title: "Step 2" },
          { id: "s3", title: "Step 3" },
        ],
      },
    ],
  };

  repairNumericFields(ui);
  assert.equal(typeof ui.children[0].current, "number");
  assert.equal(ui.children[0].current, 2);
});

test("repairNumericFields converts localAction numeric fields", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "btn",
        type: "button",
        label: "+1",
        intent: "increment",
        localAction: {
          type: "increment",
          binding: "count",
          step: "1",
          min: "0",
          max: "100",
        },
      },
    ],
  };

  repairNumericFields(ui);

  const la = ui.children[0].localAction;
  assert.equal(typeof la.step, "number");
  assert.equal(la.step, 1);
  assert.equal(typeof la.min, "number");
  assert.equal(la.min, 0);
  assert.equal(typeof la.max, "number");
  assert.equal(la.max, 100);
});

test("repairNumericFields converts interaction.debounceMs to number", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "input",
        type: "text_input",
        binding: "search",
        interaction: {
          mode: "local",
          debounceMs: "300",
        },
      },
    ],
  };

  repairNumericFields(ui);
  assert.equal(typeof ui.children[0].interaction.debounceMs, "number");
  assert.equal(ui.children[0].interaction.debounceMs, 300);
});

// ─── Test 12: repairNumericFields safety — does NOT coerce non-numeric strings ──

test("repairNumericFields does NOT corrupt non-numeric string values", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "bad_progress",
        type: "progress",
        value: "not_a_number", // should stay as string → Zod will still reject
        max: "100",
      },
    ],
  };

  repairNumericFields(ui);

  // Non-numeric string should NOT be converted
  assert.equal(
    typeof ui.children[0].value,
    "string",
    "Non-numeric string should stay as string",
  );
  assert.equal(ui.children[0].value, "not_a_number");

  // Valid numeric string should still be converted
  assert.equal(typeof ui.children[0].max, "number");
  assert.equal(ui.children[0].max, 100);
});

test("repairNumericFields does NOT modify already-correct number values", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "progress",
        type: "progress",
        value: 70,
        max: 100,
      },
    ],
  };

  repairNumericFields(ui);

  // Should remain unchanged
  assert.equal(typeof ui.children[0].value, "number");
  assert.equal(ui.children[0].value, 70);
  assert.equal(typeof ui.children[0].max, "number");
  assert.equal(ui.children[0].max, 100);
});

test("repairNumericFields handles empty string (does not coerce to 0)", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "progress",
        type: "progress",
        value: "", // empty string — should NOT become 0
        max: "100",
      },
    ],
  };

  repairNumericFields(ui);

  // Empty string should NOT be coerced to 0
  assert.equal(
    typeof ui.children[0].value,
    "string",
    "Empty string should stay as string",
  );
  assert.equal(ui.children[0].value, "");

  // Valid numeric string should still work
  assert.equal(typeof ui.children[0].max, "number");
  assert.equal(ui.children[0].max, 100);
});

// ─── Test 13: validateResponse auto-repairs string numbers before Zod parse ──

test("validateResponse auto-repairs progress node string value/max and passes", () => {
  const { validateResponse } = validateModule;

  const response = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "test", title: "Test", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: {
        id: "root",
        type: "screen",
        children: [
          {
            id: "demo_progress",
            type: "progress",
            label: "进度",
            value: "70", // string — the exact bug from runtime log
            max: "100", // string
            tone: "primary",
          },
        ],
      },
    },
  };

  const result = validateResponse(response);
  assert.equal(
    result.ok,
    true,
    `Should auto-repair string numbers and pass validation. Errors: ${result.ok ? "none" : result.errors.join("; ")}`,
  );

  if (result.ok) {
    const progress = result.value.next.ui.children[0];
    assert.equal(
      typeof progress.value,
      "number",
      "Repaired value should be number",
    );
    assert.equal(progress.value, 70);
    assert.equal(
      typeof progress.max,
      "number",
      "Repaired max should be number",
    );
    assert.equal(progress.max, 100);
  }
});

test("validateResponse auto-repairs slider node string fields and passes", () => {
  const { validateResponse } = validateModule;

  const response = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "test", title: "Test", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: {
        id: "root",
        type: "screen",
        children: [
          {
            id: "slider1",
            type: "slider",
            value: "50",
            min: "0",
            max: "100",
            binding: "vol",
          },
        ],
      },
    },
  };

  const result = validateResponse(response);
  assert.equal(
    result.ok,
    true,
    `Should auto-repair slider string numbers. Errors: ${result.ok ? "none" : result.errors.join("; ")}`,
  );
});

test("validateResponse auto-repairs deeply nested string numbers", () => {
  const { validateResponse } = validateModule;

  const response = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "test", title: "Test", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: {
        id: "root",
        type: "screen",
        children: [
          {
            id: "grid",
            type: "grid",
            columns: 2,
            children: [
              {
                id: "panel",
                type: "panel",
                title: "Stats",
                children: [
                  {
                    id: "progress1",
                    type: "progress",
                    value: "45",
                    max: "100",
                  },
                  {
                    id: "stepper1",
                    type: "stepper",
                    value: "7",
                    binding: "qty",
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  };

  const result = validateResponse(response);
  assert.equal(
    result.ok,
    true,
    `Should auto-repair deeply nested string numbers. Errors: ${result.ok ? "none" : result.errors.join("; ")}`,
  );
});

// ─── Test 14: repairNumericFields handles radar_chart series values ──────────

test("repairNumericFields converts radar_chart series values to numbers", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "radar",
        type: "radar_chart",
        title: "Skills",
        axes: ["A", "B", "C"],
        series: [{ name: "Player 1", values: ["80", "60", "90"] }],
        maxValue: "100",
      },
    ],
  };

  repairNumericFields(ui);

  const radar = ui.children[0];
  assert.equal(typeof radar.maxValue, "number");
  assert.equal(radar.maxValue, 100);
  assert.equal(typeof radar.series[0].values[0], "number");
  assert.equal(radar.series[0].values[0], 80);
  assert.equal(typeof radar.series[0].values[1], "number");
  assert.equal(radar.series[0].values[1], 60);
});

// ─── Test 15: repairNumericFields handles heatmap data ──────────────────────

test("repairNumericFields converts heatmap 2D array strings to numbers", () => {
  const { repairNumericFields } = validateModule;

  const ui = {
    id: "root",
    type: "screen",
    children: [
      {
        id: "hm",
        type: "heatmap",
        title: "Activity",
        xLabels: ["Mon", "Tue"],
        yLabels: ["AM", "PM"],
        data: [
          ["1", "2"],
          ["3", "4"],
        ],
        colorScale: "blue",
        cellSize: "md",
      },
    ],
  };

  repairNumericFields(ui);

  const hm = ui.children[0];
  assert.equal(typeof hm.data[0][0], "number");
  assert.equal(hm.data[0][0], 1);
  assert.equal(typeof hm.data[1][1], "number");
  assert.equal(hm.data[1][1], 4);
});
