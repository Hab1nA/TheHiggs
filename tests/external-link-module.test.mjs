/**
 * Module tests for the external_link UI element.
 *
 * Covers:
 *  1. Schema validation: valid node accepts, missing fields rejects
 *  2. Full AUIRResponse with external_link child validates
 *  3. ALLOWED_COMPONENTS includes "external_link"
 *  4. ALLOWED_COMPONENTS ↔ uiNodeSchema consistency for external_link
 *  5. Renderer: ExternalLinkRender exists and dispatches correctly
 *  6. Renderer: uses <a> tag with security attributes
 *  7. Renderer: blocks javascript: protocol
 *  8. Renderer: variant styling maps correctly
 *  9. Renderer: displays ↦ external indicator
 * 10. Renderer: does NOT trigger AI events (no onAIEvent usage)
 */

import assert from "node:assert/strict";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const outDir = join(root, ".test-build-external-link");

function readSrc(relPath) {
  return readFileSync(join(root, relPath), "utf-8");
}

// ─── Compile schema/constraints for runtime testing ──────────

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
      "src/auir/types.ts",
    ],
  };

  const tsconfigPath = join(root, "tsconfig.test-external-link.json");
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

let schemaModule;
let constraintsModule;
let validateModule;

test.before(async () => {
  compileSources();
  schemaModule = await importCompiled("schema.js");
  constraintsModule = await importCompiled("constraints.js");
  validateModule = await importCompiled("validate.js");
});

// ─── Helper: valid external_link node ────────────────────────

function validExternalLinkNode(overrides = {}) {
  return {
    id: "ext_link_1",
    type: "external_link",
    label: "Visit GitHub",
    url: "https://github.com/example/repo",
    ...overrides,
  };
}

function wrapInScreen(children) {
  return {
    id: "root_screen",
    type: "screen",
    title: "Test",
    children: Array.isArray(children) ? children : [children],
  };
}

function validAUIRResponse(ui) {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "test", title: "Test", kind: "utility" },
      memory: { app: {}, session: {} },
      ui,
    },
  };
}

// ==============================================================
// 1. Schema: external_link node validates correctly
// ==============================================================

test("Schema: external_link node with all required fields passes", () => {
  const { externalLinkNodeSchema } = schemaModule;
  assert.ok(
    externalLinkNodeSchema,
    "externalLinkNodeSchema should be exported",
  );
  const node = validExternalLinkNode();
  const result = externalLinkNodeSchema.safeParse(node);
  assert.equal(
    result.success,
    true,
    `Should pass: ${JSON.stringify(result.error?.issues)}`,
  );
});

test("Schema: external_link node with variant passes", () => {
  const { externalLinkNodeSchema } = schemaModule;
  for (const variant of ["primary", "secondary", "ghost", "danger"]) {
    const node = validExternalLinkNode({ variant });
    const result = externalLinkNodeSchema.safeParse(node);
    assert.equal(result.success, true, `variant="${variant}" should pass`);
  }
});

test("Schema: external_link node without variant passes (optional)", () => {
  const { externalLinkNodeSchema } = schemaModule;
  const { variant: _, ...noVariant } = validExternalLinkNode();
  const result = externalLinkNodeSchema.safeParse(noVariant);
  assert.equal(result.success, true, "Missing variant should pass");
});

test("Schema: external_link node without label fails", () => {
  const { externalLinkNodeSchema } = schemaModule;
  const { label: _, ...noLabel } = validExternalLinkNode();
  const result = externalLinkNodeSchema.safeParse(noLabel);
  assert.equal(result.success, false, "Missing label should fail");
});

test("Schema: external_link node without url fails", () => {
  const { externalLinkNodeSchema } = schemaModule;
  const { url: _, ...noUrl } = validExternalLinkNode();
  const result = externalLinkNodeSchema.safeParse(noUrl);
  assert.equal(result.success, false, "Missing url should fail");
});

test("Schema: external_link node with invalid variant fails", () => {
  const { externalLinkNodeSchema } = schemaModule;
  const node = validExternalLinkNode({ variant: "outline" });
  const result = externalLinkNodeSchema.safeParse(node);
  assert.equal(result.success, false, 'variant="outline" should fail');
});

test("Schema: external_link node with optional base fields passes", () => {
  const { externalLinkNodeSchema } = schemaModule;
  const node = validExternalLinkNode({
    visible: true,
    semanticRole: "navigation",
    intent: "Open external page",
    expectedEffect: "User navigates to external URL in new tab",
    layout: { width: "full" },
    style: { tone: "primary", emphasis: "high" },
  });
  const result = externalLinkNodeSchema.safeParse(node);
  assert.equal(
    result.success,
    true,
    `Should pass with all optional fields: ${JSON.stringify(result.error?.issues)}`,
  );
});

// ==============================================================
// 2. Full AUIRResponse with external_link child validates
// ==============================================================

test("Schema: full AUIRResponse with external_link in screen children passes", () => {
  const { validateResponse } = validateModule;
  const ui = wrapInScreen([
    { id: "heading1", type: "heading", text: "Links", level: 1 },
    validExternalLinkNode(),
    { id: "btn1", type: "button", label: "Action", intent: "test" },
  ]);
  const response = validAUIRResponse(ui);
  const result = validateResponse(response);
  assert.equal(
    result.ok,
    true,
    `Should accept response with external_link: ${result.ok ? "none" : result.errors.join("; ")}`,
  );
});

test("Schema: validateResponse rejects external_link with missing url in full response", () => {
  const { validateResponse } = validateModule;
  const ui = wrapInScreen([
    { id: "bad_link", type: "external_link", label: "No URL" },
  ]);
  const response = validAUIRResponse(ui);
  const result = validateResponse(response);
  assert.equal(result.ok, false, "Should reject external_link without url");
});

// ==============================================================
// 3. ALLOWED_COMPONENTS includes "external_link"
// ==============================================================

test("Constraints: ALLOWED_COMPONENTS includes 'external_link'", () => {
  const { ALLOWED_COMPONENTS } = constraintsModule;
  assert.ok(
    ALLOWED_COMPONENTS.includes("external_link"),
    `ALLOWED_COMPONENTS should include "external_link", got: ${ALLOWED_COMPONENTS.join(", ")}`,
  );
});

// ==============================================================
// 4. ALLOWED_COMPONENTS ↔ uiNodeSchema consistency
// ==============================================================

test("Schema: external_link is in uiNodeSchema discriminated union", () => {
  const { uiNodeSchema } = schemaModule;
  const schemaTypes = uiNodeSchema._def.options.map(
    (opt) => opt.shape.type._def.value,
  );
  assert.ok(
    schemaTypes.includes("external_link"),
    `uiNodeSchema should include "external_link", got: ${schemaTypes.join(", ")}`,
  );
});

// ==============================================================
// 5. Renderer: ExternalLinkRender exists and dispatches
// ==============================================================

test("Renderer: ExternalLinkRender function exists", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  assert.ok(
    src.includes("function ExternalLinkRender("),
    "ExternalLinkRender function should exist in Renderer.tsx",
  );
});

test("Renderer: renderNode dispatches 'external_link' to ExternalLinkRender", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  assert.ok(
    src.includes('if (t === "external_link") return <ExternalLinkRender'),
    'renderNode should dispatch type="external_link" to ExternalLinkRender',
  );
});

// ==============================================================
// 6. Renderer: uses <a> tag with security attributes
// ==============================================================

test("Renderer: ExternalLinkRender uses <a> tag (not <button>)", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  // Extract ExternalLinkRender function
  const fnStart = src.indexOf("function ExternalLinkRender(");
  const fnEnd = src.indexOf("\nfunction ", fnStart + 1);
  const fnCode = src.slice(fnStart, fnEnd);

  assert.ok(fnCode.includes("<a"), "Should render <a> tag");
  assert.ok(!fnCode.includes("<button"), "Should NOT render <button> tag");
});

test("Renderer: ExternalLinkRender has target='_blank'", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const fnStart = src.indexOf("function ExternalLinkRender(");
  const fnEnd = src.indexOf("\nfunction ", fnStart + 1);
  const fnCode = src.slice(fnStart, fnEnd);

  assert.ok(
    fnCode.includes('target="_blank"'),
    "Should have target='_blank' for new tab",
  );
});

test("Renderer: ExternalLinkRender has rel='noopener noreferrer'", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const fnStart = src.indexOf("function ExternalLinkRender(");
  const fnEnd = src.indexOf("\nfunction ", fnStart + 1);
  const fnCode = src.slice(fnStart, fnEnd);

  assert.ok(
    fnCode.includes('rel="noopener noreferrer"'),
    "Should have rel='noopener noreferrer' for security",
  );
});

// ==============================================================
// 7. Renderer: blocks javascript: protocol
// ==============================================================

test("Renderer: ExternalLinkRender blocks javascript: URLs", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const fnStart = src.indexOf("function ExternalLinkRender(");
  const fnEnd = src.indexOf("\nfunction ", fnStart + 1);
  const fnCode = src.slice(fnStart, fnEnd);

  assert.ok(
    fnCode.includes("javascript:"),
    "Should check for javascript: protocol",
  );
  assert.ok(
    fnCode.toLowerCase().includes("return null"),
    "Should return null (not render) for javascript: URLs",
  );
});

// ==============================================================
// 8. Renderer: variant styling maps correctly
// ==============================================================

test("Renderer: ExternalLinkRender has variant→class mapping", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const fnStart = src.indexOf("function ExternalLinkRender(");
  const fnEnd = src.indexOf("\nfunction ", fnStart + 1);
  const fnCode = src.slice(fnStart, fnEnd);

  // Should have same variant map as ButtonRender (keys as object properties)
  assert.ok(fnCode.includes("primary:"), "Should define primary variant");
  assert.ok(fnCode.includes("secondary:"), "Should define secondary variant");
  assert.ok(fnCode.includes("ghost:"), "Should define ghost variant");
  assert.ok(fnCode.includes("danger:"), "Should define danger variant");
  assert.ok(fnCode.includes("n.variant"), "Should read variant from node");
});

test("Renderer: ExternalLinkRender defaults variant to 'primary'", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const fnStart = src.indexOf("function ExternalLinkRender(");
  const fnEnd = src.indexOf("\nfunction ", fnStart + 1);
  const fnCode = src.slice(fnStart, fnEnd);

  assert.ok(
    fnCode.includes('"primary"') && fnCode.includes("??"),
    "Should default to 'primary' variant when not specified",
  );
});

// ==============================================================
// 9. Renderer: displays ↦ external indicator
// ==============================================================

test("Renderer: ExternalLinkRender shows external link indicator (↦)", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const fnStart = src.indexOf("function ExternalLinkRender(");
  const fnEnd = src.indexOf("\nfunction ", fnStart + 1);
  const fnCode = src.slice(fnStart, fnEnd);

  assert.ok(
    fnCode.includes("↦") || fnCode.includes("↗") || fnCode.includes("→"),
    "Should display an external link indicator",
  );
});

// ==============================================================
// 10. Renderer: does NOT trigger AI events
// ==============================================================

test("Renderer: ExternalLinkRender does not use onAIEvent", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const fnStart = src.indexOf("function ExternalLinkRender(");
  const fnEnd = src.indexOf("\nfunction ", fnStart + 1);
  const fnCode = src.slice(fnStart, fnEnd);

  assert.ok(
    !fnCode.includes("onAIEvent"),
    "ExternalLinkRender should NOT trigger AI events",
  );
  assert.ok(
    !fnCode.includes("createComponentClickEvent"),
    "ExternalLinkRender should NOT create component click events",
  );
});

test("Renderer: ExternalLinkRender does not use localState/setLocalValue", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const fnStart = src.indexOf("function ExternalLinkRender(");
  const fnEnd = src.indexOf("\nfunction ", fnStart + 1);
  const fnCode = src.slice(fnStart, fnEnd);

  assert.ok(
    !fnCode.includes("localState"),
    "ExternalLinkRender should NOT use localState",
  );
  assert.ok(
    !fnCode.includes("setLocalValue"),
    "ExternalLinkRender should NOT use setLocalValue",
  );
});

// ==============================================================
// 11. Renderer: href binding
// ==============================================================

test("Renderer: ExternalLinkRender reads url from node", () => {
  const src = readSrc("src/runtime/Renderer.tsx");
  const fnStart = src.indexOf("function ExternalLinkRender(");
  const fnEnd = src.indexOf("\nfunction ", fnStart + 1);
  const fnCode = src.slice(fnStart, fnEnd);

  assert.ok(fnCode.includes("n.url"), "Should read url from node properties");
  assert.ok(fnCode.includes("href="), "Should bind url to href attribute");
});

// ==============================================================
// 12. Cleanup
// ==============================================================

test.after(() => {
  try {
    rmSync(outDir, { recursive: true, force: true });
  } catch {}
});
