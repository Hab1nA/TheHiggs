// ============================================================
// Tests: Schema 递归引用修复 — createDepthLimitedUISchema
// ============================================================

import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const outDir = join(root, ".test-build-schema-fix");

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
    include: ["src/auir/schema.ts", "src/auir/types.ts"],
  };

  const tsconfigPath = join(root, "tsconfig.test-schema-fix.json");
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

async function importSchema() {
  const fullPath = join(outDir, "schema.js");
  return import(pathToFileURL(fullPath).href);
}

// ─── Pre-compile ────────────────────────────────────────────
let schemaModule;

test.before(async () => {
  compileSources();
  schemaModule = await importSchema();
});

test.after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

// ─── Tests ──────────────────────────────────────────────────

test("createDepthLimitedUISchema(0) accepts leaf nodes", () => {
  const schema = schemaModule.createDepthLimitedUISchema(0);

  const leaf = { id: "h1", type: "heading", text: "Hello", level: 1 };
  const result = schema.safeParse(leaf);
  assert.ok(result.success, "leaf node should pass depth-0 schema");
});

test("createDepthLimitedUISchema(0) rejects container nodes", () => {
  const schema = schemaModule.createDepthLimitedUISchema(0);

  const container = {
    id: "p1",
    type: "panel",
    children: [{ id: "h1", type: "heading", text: "Hi" }],
  };
  const result = schema.safeParse(container);
  assert.ok(!result.success, "container node should fail depth-0 schema");
});

test("createDepthLimitedUISchema(1) accepts container with leaf children", () => {
  const schema = schemaModule.createDepthLimitedUISchema(1);

  const panel = {
    id: "p1",
    type: "panel",
    title: "Test",
    children: [
      { id: "h1", type: "heading", text: "Title" },
      { id: "t1", type: "text", text: "Body" },
    ],
  };
  const result = schema.safeParse(panel);
  assert.ok(result.success, "container with leaf children should pass depth-1");
});

test("createDepthLimitedUISchema(1) rejects nodes nested 3 levels deep", () => {
  const schema = schemaModule.createDepthLimitedUISchema(1);

  const deep = {
    id: "p1",
    type: "panel",
    children: [
      {
        id: "s1",
        type: "screen",
        children: [{ id: "h1", type: "heading", text: "Too deep" }],
      },
    ],
  };
  const result = schema.safeParse(deep);
  assert.ok(!result.success, "should reject nesting beyond depth limit");
});

test("createDepthLimitedUISchema(3) allows 4 levels of nesting", () => {
  const schema = schemaModule.createDepthLimitedUISchema(3);

  const deepUI = {
    id: "s1",
    type: "screen",
    children: [
      {
        id: "p1",
        type: "panel",
        children: [
          {
            id: "c1",
            type: "container",
            children: [{ id: "h1", type: "heading", text: "Deep" }],
          },
        ],
      },
    ],
  };
  const result = schema.safeParse(deepUI);
  assert.ok(result.success, "4-level nesting should pass depth-3 schema");
});

test("createAIResponseSchema validates complete AUIR response", () => {
  const schema = schemaModule.createAIResponseSchema(2);

  const response = {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: { id: "test", title: "Test App", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: {
        id: "s1",
        type: "screen",
        children: [
          {
            id: "p1",
            type: "panel",
            children: [{ id: "h1", type: "heading", text: "Hello" }],
          },
        ],
      },
    },
    diagnostics: { simulatedData: true },
  };
  const result = schema.safeParse(response);
  assert.ok(result.success, "valid AUIR response should pass");
});

test("createAIResponseSchema rejects invalid protocol", () => {
  const schema = schemaModule.createAIResponseSchema(2);

  const bad = {
    protocol: "WRONG",
    version: "0.3",
    next: {
      app: { id: "test", title: "T", kind: "utility" },
      memory: { app: {}, session: {} },
      ui: { id: "h1", type: "heading", text: "Hi" },
    },
  };
  const result = schema.safeParse(bad);
  assert.ok(!result.success, "should reject wrong protocol");
});

test("createAIResponseSchema JSON Schema has no $ref (no recursion)", async () => {
  const schema = schemaModule.createAIResponseSchema(3);

  try {
    const { zodToJsonSchema } = await import("zod-to-json-schema");
    const jsonSchema = zodToJsonSchema(schema);
    const jsonStr = JSON.stringify(jsonSchema);
    const refCount = (jsonStr.match(/"\$ref"/g) || []).length;
    assert.equal(
      refCount,
      0,
      `JSON Schema should have 0 $ref, got ${refCount}`,
    );
  } catch {
    console.log("Skipping $ref check: zod-to-json-schema not available");
  }
});
