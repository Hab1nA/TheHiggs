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
