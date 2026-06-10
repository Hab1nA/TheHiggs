/**
 * Tests for append_text LocalAction — virtual keyboard button feature.
 *
 * Verifies:
 *  1. Source: append_text variant exists in types.ts, schema.ts, Renderer.tsx, prompt.ts
 *  2. Schema: Zod accepts valid append_text localAction, rejects invalid
 *  3. Full AUIRResponse with append_text button passes validation
 *  4. Renderer: ButtonRender handleClick handles append_text correctly (source analysis)
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";

const root = process.cwd();

function readSrc(relPath) {
  return readFileSync(join(root, relPath), "utf-8");
}

// ─── Compile schema+validate for behavioral tests ────────────

const outDir = join(root, ".test-build-append-text");

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

  const tsconfigPath = join(root, "tsconfig.test-append-text.json");
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

let validateModule;

test.before(async () => {
  compileSources();
  validateModule = await importCompiled("validate.js");
});

test.after(() => {
  try {
    rmSync(outDir, { recursive: true, force: true });
  } catch {}
});

// ═══════════════════════════════════════════════════════════════
// SOURCE VERIFICATION
// ═══════════════════════════════════════════════════════════════

test("Source: types.ts defines append_text variant in LocalAction", () => {
  const src = readSrc("src/auir/types.ts");
  assert.ok(
    src.includes('"append_text"'),
    'types.ts should contain "append_text" string literal',
  );
  assert.ok(
    src.includes("targetBinding: string"),
    "types.ts should define targetBinding field on append_text",
  );
  assert.ok(
    src.includes("text: string"),
    "types.ts should define text field on append_text",
  );
});

test("Source: schema.ts defines append_text in localActionSchema", () => {
  const src = readSrc("src/auir/schema.ts");
  assert.ok(
    src.includes('z.literal("append_text")'),
    'schema.ts should have z.literal("append_text") in localActionSchema',
  );
  assert.ok(
    src.includes("targetBinding: z.string()"),
    "schema.ts should validate targetBinding as string",
  );
  assert.ok(
    src.includes("text: z.string()"),
    "schema.ts should validate text as string",
  );
});

test("Source: Renderer.tsx handles append_text in ButtonRender", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  // Find ButtonRender function
  const btnStart = src.indexOf("function ButtonRender(");
  assert.ok(btnStart > -1, "ButtonRender function should exist");
  const btnEnd = src.indexOf("function ExternalLinkRender(");
  assert.ok(btnEnd > -1, "ExternalLinkRender should follow ButtonRender");
  const btnCode = src.slice(btnStart, btnEnd);

  // Should check for append_text type
  assert.ok(
    btnCode.includes('"append_text"'),
    "ButtonRender handleClick should handle append_text type",
  );

  // Should reference targetBinding
  assert.ok(
    btnCode.includes("targetBinding"),
    "ButtonRender should use targetBinding for append_text",
  );

  // Should read current value from targetBinding (not binding)
  assert.ok(
    btnCode.includes("localAction.targetBinding"),
    "Should read targetBinding from localAction",
  );

  // Should concatenate text to current value
  assert.ok(
    btnCode.includes("currentText") || btnCode.includes("localAction.text"),
    "Should concatenate text to current value",
  );

  // localAction type assertion should include targetBinding and text fields
  assert.ok(
    btnCode.includes("targetBinding?: string"),
    "localAction type assertion should include targetBinding field",
  );
  assert.ok(
    btnCode.includes("text?: string"),
    "localAction type assertion should include text field",
  );
});

test("Source: Renderer.tsx append_text does NOT trigger AI event", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const btnStart = src.indexOf("function ButtonRender(");
  const btnEnd = src.indexOf("function ExternalLinkRender(");
  const btnCode = src.slice(btnStart, btnEnd);

  // Find the append_text handling block
  const appendIdx = btnCode.indexOf('"append_text"');
  assert.ok(appendIdx > -1, "append_text handler should exist");

  // The append_text block should NOT call onAIEvent
  // Check a reasonable window after append_text (the block should end with return)
  const appendBlock = btnCode.slice(appendIdx, appendIdx + 400);
  assert.ok(
    !appendBlock.includes("onAIEvent("),
    "append_text handler should NOT call onAIEvent (no AI round-trip)",
  );
});

test("Source: prompt.ts documents append_text usage", () => {
  const src = readSrc("src/auir/prompt.ts");
  assert.ok(
    src.includes("append_text"),
    "prompt.ts should document append_text localAction",
  );
  assert.ok(
    src.includes("targetBinding"),
    "prompt.ts should mention targetBinding in append_text docs",
  );
});

// ═══════════════════════════════════════════════════════════════
// SCHEMA VALIDATION (via validateResponse — localActionSchema is not exported)
// ═══════════════════════════════════════════════════════════════

function makeResponse(buttonLocalAction) {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "test", title: "Test", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: {
        id: "screen",
        type: "screen",
        children: [
          {
            id: "input",
            type: "text_input",
            binding: "formula",
            interaction: { mode: "local" },
          },
          {
            id: "btn",
            type: "button",
            label: "X",
            intent: "test",
            interaction: { mode: "local" },
            localAction: buttonLocalAction,
          },
        ],
      },
    },
  };
}

test("Schema: accepts valid append_text localAction", () => {
  const { validateResponse } = validateModule;
  const result = validateResponse(
    makeResponse({
      type: "append_text",
      targetBinding: "formula",
      text: "sin(",
    }),
  );
  assert.equal(
    result.ok,
    true,
    `Should accept valid append_text. Errors: ${result.ok ? "none" : result.errors.join("; ")}`,
  );
});

test("Schema: rejects append_text with missing targetBinding", () => {
  const { validateResponse } = validateModule;
  const result = validateResponse(
    makeResponse({ type: "append_text", text: "sin(" }),
  );
  assert.equal(result.ok, false, "Should reject missing targetBinding");
});

test("Schema: rejects append_text with missing text", () => {
  const { validateResponse } = validateModule;
  const result = validateResponse(
    makeResponse({ type: "append_text", targetBinding: "formula" }),
  );
  assert.equal(result.ok, false, "Should reject missing text");
});

test("Schema: rejects append_text with non-string targetBinding", () => {
  const { validateResponse } = validateModule;
  const result = validateResponse(
    makeResponse({ type: "append_text", targetBinding: 123, text: "x" }),
  );
  assert.equal(result.ok, false, "Should reject non-string targetBinding");
});

test("Schema: rejects append_text with non-string text", () => {
  const { validateResponse } = validateModule;
  const result = validateResponse(
    makeResponse({ type: "append_text", targetBinding: "formula", text: 42 }),
  );
  assert.equal(result.ok, false, "Should reject non-string text");
});

test("Schema: accepts append_text with empty text (edge case)", () => {
  const { validateResponse } = validateModule;
  const result = validateResponse(
    makeResponse({ type: "append_text", targetBinding: "formula", text: "" }),
  );
  assert.equal(
    result.ok,
    true,
    `Should accept empty text. Errors: ${result.ok ? "none" : result.errors.join("; ")}`,
  );
});

// ═══════════════════════════════════════════════════════════════
// FULL AUIR RESPONSE VALIDATION
// ═══════════════════════════════════════════════════════════════

test("Full response: AUIRResponse with append_text button passes validation", () => {
  const { validateResponse } = validateModule;

  const response = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "calculator", title: "Calculator", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: {
        id: "screen",
        type: "screen",
        title: "Calculator",
        children: [
          {
            id: "display",
            type: "text_input",
            label: "Expression",
            binding: "formula",
            value: "",
            interaction: { mode: "local" },
          },
          {
            id: "btn_7",
            type: "button",
            label: "7",
            intent: "append_digit_7",
            interaction: { mode: "local" },
            localAction: {
              type: "append_text",
              targetBinding: "formula",
              text: "7",
            },
          },
          {
            id: "btn_plus",
            type: "button",
            label: "+",
            intent: "append_plus",
            interaction: { mode: "local" },
            localAction: {
              type: "append_text",
              targetBinding: "formula",
              text: "+",
            },
          },
        ],
      },
    },
  };

  const result = validateResponse(response);
  assert.equal(
    result.ok,
    true,
    `Full response with append_text buttons should pass validation. Errors: ${result.ok ? "none" : result.errors.join("; ")}`,
  );
});

test("Full response: multiple append_text buttons targeting same binding", () => {
  const { validateResponse } = validateModule;

  const keys = ["sin(", "cos(", "tan(", "π", "e", "(", ")", "7", "8", "9"];
  const children = keys.map((k) => ({
    id: `btn_${k.replace(/[^a-z0-9]/gi, "")}`,
    type: "button",
    label: k,
    intent: `append_${k}`,
    interaction: { mode: "local" },
    localAction: {
      type: "append_text",
      targetBinding: "formula",
      text: k,
    },
  }));

  const response = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "calc", title: "Calc", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: {
        id: "screen",
        type: "screen",
        children: [
          {
            id: "input",
            type: "textarea",
            binding: "formula",
            interaction: { mode: "local" },
          },
          ...children,
        ],
      },
    },
  };

  const result = validateResponse(response);
  assert.equal(
    result.ok,
    true,
    `Response with ${keys.length} append_text buttons should pass. Errors: ${result.ok ? "none" : result.errors.join("; ")}`,
  );
});

test("Full response: append_text button targeting textarea binding", () => {
  const { validateResponse } = validateModule;

  const response = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "editor", title: "Editor", kind: "productivity_tool" },
      memory: { app: {}, session: {} },
      ui: {
        id: "screen",
        type: "screen",
        children: [
          {
            id: "code_area",
            type: "textarea",
            label: "Code",
            binding: "code",
            interaction: { mode: "local" },
          },
          {
            id: "btn_snippet",
            type: "button",
            label: "for loop",
            intent: "insert_for_loop",
            interaction: { mode: "local" },
            localAction: {
              type: "append_text",
              targetBinding: "code",
              text: "for (let i = 0; i < n; i++) {\n  \n}",
            },
          },
        ],
      },
    },
  };

  const result = validateResponse(response);
  assert.equal(
    result.ok,
    true,
    `append_text targeting textarea should pass. Errors: ${result.ok ? "none" : result.errors.join("; ")}`,
  );
});

test("Full response: mixed append_text and ai_transition buttons coexist", () => {
  const { validateResponse } = validateModule;

  const response = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "mixed", title: "Mixed", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: {
        id: "screen",
        type: "screen",
        children: [
          {
            id: "input",
            type: "text_input",
            binding: "expr",
            interaction: { mode: "local" },
          },
          {
            id: "btn_1",
            type: "button",
            label: "1",
            intent: "append_one",
            interaction: { mode: "local" },
            localAction: {
              type: "append_text",
              targetBinding: "expr",
              text: "1",
            },
          },
          {
            id: "btn_calc",
            type: "button",
            label: "Calculate",
            intent: "calculate",
            variant: "primary",
            interaction: {
              mode: "ai_transition",
              commitOn: ["click"],
              includeLocalStateOnCommit: true,
            },
          },
        ],
      },
    },
  };

  const result = validateResponse(response);
  assert.equal(
    result.ok,
    true,
    `Mixed append_text + ai_transition buttons should pass. Errors: ${result.ok ? "none" : result.errors.join("; ")}`,
  );
});

// ═══════════════════════════════════════════════════════════════
// RENDERER LOGIC ANALYSIS (source-level behavioral verification)
// ═══════════════════════════════════════════════════════════════

test("Renderer logic: append_text reads from targetBinding, not binding", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const btnStart = src.indexOf("function ButtonRender(");
  const btnEnd = src.indexOf("function ExternalLinkRender(");
  const btnCode = src.slice(btnStart, btnEnd);

  // The append_text handler should resolve targetBinding value
  // (append_text has targetBinding as required field, no fallback to binding needed)
  assert.ok(
    btnCode.includes("localAction.targetBinding"),
    "append_text should use targetBinding to resolve the target input",
  );

  // append_text must be handled BEFORE the binding check
  // (since append_text has no binding field, it would be filtered out by `if (!binding) return`)
  const appendIdx = btnCode.indexOf('"append_text"');
  const bindingCheckIdx = btnCode.indexOf("const binding = localAction.binding");
  assert.ok(
    appendIdx < bindingCheckIdx,
    "append_text handler must appear before the binding guard check",
  );
});

test("Renderer logic: append_text concatenates (not replaces) current value", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const btnStart = src.indexOf("function ButtonRender(");
  const btnEnd = src.indexOf("function ExternalLinkRender(");
  const btnCode = sliceBlock(btnStart, btnEnd, src);

  // Should concatenate: currentText + text
  assert.ok(
    btnCode.includes("currentText + (localAction.text"),
    "append_text should concatenate text to current value",
  );
});

test("Renderer logic: append_text uses String() for safe conversion", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const btnStart = src.indexOf("function ButtonRender(");
  const btnEnd = src.indexOf("function ExternalLinkRender(");
  const btnCode = sliceBlock(btnStart, btnEnd, src);

  // Should convert current value to string safely
  assert.ok(
    btnCode.includes("String("),
    "append_text should convert current value to string",
  );
});

test("Renderer logic: append_text calls setLocalValue (local state update)", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const btnStart = src.indexOf("function ButtonRender(");
  const btnEnd = src.indexOf("function ExternalLinkRender(");
  const btnCode = sliceBlock(btnStart, btnEnd, src);

  const appendIdx = btnCode.indexOf('"append_text"');
  const appendBlock = btnCode.slice(appendIdx, appendIdx + 500);

  assert.ok(
    appendBlock.includes("setLocalValue("),
    "append_text should call setLocalValue to update local state",
  );
});

// ─── Helpers ─────────────────────────────────────────────────

function sliceBlock(start, end, src) {
  return src.slice(start, end);
}
