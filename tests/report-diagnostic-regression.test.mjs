/**
 * Regression tests for docs/E2E_Test_Diagnostic_Report_2026-06-07.md.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = process.cwd();
process.env.NODE_PATH = join(root, "node_modules");
Module._initPaths();

function compileSources(outDir, include) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const tsconfigPath = join(root, "tsconfig.report-diagnostic-test.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          outDir,
          declaration: false,
          sourceMap: false,
          skipLibCheck: true,
          strict: true,
          esModuleInterop: true,
          baseUrl: root,
          paths: { "@/*": ["./src/*"] },
        },
        include,
      },
      null,
      2,
    ),
  );

  try {
    execFileSync(
      process.execPath,
      ["node_modules/typescript/bin/tsc", "--project", tsconfigPath],
      { cwd: root, stdio: "pipe" },
    );
  } finally {
    rmSync(tsconfigPath, { force: true });
  }
}

function assertNoSelfOrForwardRefs(schema, defName, maxAllowedRef) {
  const text = JSON.stringify(schema.$defs[defName]);
  for (let i = maxAllowedRef + 1; i <= 8; i++) {
    assert.ok(
      !text.includes(`#/$defs/uiNode${i}`),
      `${defName} should not reference uiNode${i}`,
    );
  }
}

test("AI generation uses a bounded non-recursive JSON schema", async () => {
  const outDir = join(tmpdir(), "thehiggs-report-diagnostic-schema");
  compileSources(outDir, [
    "src/auir/generationSchema.ts",
    "src/auir/schema.ts",
    "src/auir/validate.ts",
    "src/auir/constraints.ts",
    "src/auir/beautify.ts",
    "src/auir/memory.ts",
    "src/auir/types.ts",
  ]);

  const mod = await import(
    pathToFileURL(join(outDir, "generationSchema.js")).href
  );
  const schema = mod.auirResponseGenerationJsonSchema;
  assert.equal(schema.type, "object");
  assert.ok(schema.$defs?.uiNode0, "bounded schema should define uiNode0");
  assert.ok(schema.$defs?.uiNode6, "bounded schema should define uiNode6");

  for (let depth = 0; depth <= 6; depth++) {
    assertNoSelfOrForwardRefs(schema, `uiNode${depth}`, depth - 1);
  }
});

test("generateNextState passes the bounded schema to UI generation attempts", () => {
  const src = readFileSync(join(root, "src/ai/generateNextState.ts"), "utf8");
  const start = src.indexOf("async function generateWithRetry(");
  const end = src.indexOf("function createBasicFallbackResponse(", start);
  assert.ok(start >= 0 && end > start, "generateWithRetry should exist");
  const chunk = src.slice(start, end);

  assert.ok(
    src.includes("auirResponseGenerationSchema"),
    "generateNextState should import the bounded generation schema",
  );
  assert.ok(
    chunk.includes("schema: auirResponseGenerationSchema"),
    "UI generation attempts should use the bounded generation schema",
  );
  assert.ok(
    !chunk.includes("schema: auirResponseSchema"),
    "UI generation attempts should not pass recursive Zod schema to generateObject",
  );
});

test("appendRuntimeLog lazily creates a page log when the file is missing", async () => {
  const outDir = join(tmpdir(), "thehiggs-report-diagnostic-logging");
  compileSources(outDir, [
    "src/runtime/logging/server.ts",
    "src/runtime/logging/sanitize.ts",
    "src/runtime/logging/types.ts",
  ]);

  const runDir = join(tmpdir(), "thehiggs-report-runtime-log-test");
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });

  const originalCwd = process.cwd();
  try {
    process.chdir(runDir);
    const mod = await import(
      `${pathToFileURL(join(outDir, "server.js")).href}?${Date.now()}`
    );
    const ok = await mod.appendRuntimeLog({
      type: "frontend.ai_event.dispatched",
      pageLogId: "page_race_test",
      sessionId: "session_race_test",
      turn: 1,
      stage: "frontend",
      status: "info",
      payload: { event: "dispatched" },
    });

    assert.equal(ok, true, "appendRuntimeLog should not drop first event");
    const files = readdirSync(join(runDir, "runtime-logs"));
    assert.equal(files.length, 1, "lazy append should create one log file");
    const lines = readFileSync(
      join(runDir, "runtime-logs", files[0]),
      "utf8",
    )
      .trim()
      .split("\n");
    assert.equal(lines.length, 2, "log should include page.started and event");
    assert.equal(JSON.parse(lines[1]).type, "frontend.ai_event.dispatched");
  } finally {
    process.chdir(originalCwd);
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("image downloads avoid known rejecting hosts and oversized data URLs", () => {
  const src = readFileSync(join(root, "src/ai/webTools.ts"), "utf8");

  assert.ok(
    src.includes("BLOCKED_IMAGE_DOWNLOAD_HOSTS"),
    "webTools should maintain a blocked host list for known 403 image sources",
  );
  assert.ok(
    src.includes("isBlockedImageDownloadHost"),
    "downloadResource should check known rejecting image hosts before fetching",
  );
  assert.ok(
    src.includes("MAX_EMBEDDED_IMAGE_BYTES"),
    "webTools should cap image bytes before converting to embedded data URLs",
  );
  assert.ok(
    src.includes("Image too large to embed"),
    "oversized images should return an explicit fallback error before base64 conversion",
  );
});

test("buttons can perform local view switching without an AI round trip", () => {
  const schema = readFileSync(join(root, "src/auir/schema.ts"), "utf8");
  const types = readFileSync(join(root, "src/auir/types.ts"), "utf8");
  const renderer = readFileSync(join(root, "src/runtime/Renderer.tsx"), "utf8");
  const prompt = readFileSync(join(root, "src/auir/prompt.ts"), "utf8");

  assert.ok(
    schema.includes('type: z.literal("set_active_tab")'),
    "localAction schema should include set_active_tab",
  );
  assert.ok(
    types.includes('type: "set_active_tab"'),
    "LocalAction type should include set_active_tab",
  );
  assert.ok(
    renderer.includes("findTabsNodeById"),
    "Renderer should locate tabs nodes for local view switching",
  );
  assert.ok(
    renderer.includes("createTabChangeEvent"),
    "Renderer should reuse tabs.change when a local view switch needs AI notification",
  );
  assert.ok(
    prompt.includes("set_active_tab"),
    "Prompt should tell the model how to generate local view-switch buttons",
  );
});
