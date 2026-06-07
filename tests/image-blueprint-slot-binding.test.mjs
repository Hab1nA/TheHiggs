/**
 * Regression tests for image blueprint and slot-aware image binding (方案B).
 *
 * Validates that:
 *  1. Schema exports image blueprint structures
 *  2. Prompt instructs model to use image slot contracts
 *  3. generateNextState integrates blueprint into decision + post-process flow
 *  4. runtime.ts forwards blueprint to postProcessImageUrls
 */

import assert from "node:assert/strict";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const outDir = join(root, ".test-build-image-blueprint");

function readSrc(relPath) {
  return readFileSync(join(root, relPath), "utf-8");
}

function compileSchemaModule() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const testTsconfig = {
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
    include: ["src/auir/schema.ts", "src/auir/types.ts"],
  };

  const tsconfigPath = join(root, "tsconfig.test-image-blueprint.json");
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

let schemaModule;

test.before(async () => {
  compileSchemaModule();
  schemaModule = await import(pathToFileURL(join(outDir, "schema.js")).href);
});

// ─── 1. Schema exports ─────────────────────────────────────────────────────

test("schema exports imageBlueprintSchema", () => {
  assert.ok(
    typeof schemaModule.imageBlueprintSchema !== "undefined",
    "imageBlueprintSchema should be exported from schema.ts",
  );
});

test("schema exports imageSlotPlanItemSchema", () => {
  assert.ok(
    typeof schemaModule.imageSlotPlanItemSchema !== "undefined",
    "imageSlotPlanItemSchema should be exported from schema.ts",
  );
});

// ─── 2. Prompt contains slot contract guidance ─────────────────────────────

test("prompt.ts contains IMAGE SLOT CONTRACT guidance", () => {
  const src = readSrc("src/auir/prompt.ts");

  assert.ok(
    src.includes("IMAGE SLOT CONTRACT"),
    "System prompt should mention IMAGE SLOT CONTRACT for slot-aware binding",
  );
  assert.ok(
    src.includes("imageBindings"),
    "System prompt should instruct model to emit imageBindings",
  );
});

// ─── 3. generateNextState wiring ──────────────────────────────────────────

test("generateNextState imports imageBlueprintSchema", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  assert.ok(
    src.includes("imageBlueprintSchema"),
    "generateNextState.ts should import imageBlueprintSchema",
  );
  assert.ok(
    src.includes("type ImageBlueprint"),
    "generateNextState.ts should import ImageBlueprint type",
  );
});

test("tool decision schema allows imageBlueprint output", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  assert.ok(
    src.includes("imageBlueprint: imageBlueprintSchema"),
    "toolDecisionSchema should include imageBlueprint field",
  );
});

test("postProcessImageUrls accepts imageBlueprint parameter", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  // Check function signature includes imageBlueprint parameter
  const fnStart = src.indexOf("export function postProcessImageUrls(");
  assert.ok(fnStart !== -1, "postProcessImageUrls function should exist");

  // Extract the signature block (up to the opening brace)
  const sigEnd = src.indexOf("): void {", fnStart);
  assert.ok(sigEnd !== -1, "postProcessImageUrls should have void return type");

  const signature = src.slice(fnStart, sigEnd);
  assert.ok(
    signature.includes("imageBlueprint?: ImageBlueprint"),
    "postProcessImageUrls should accept optional imageBlueprint parameter",
  );
});

test("generateNextState returns imageBlueprint to caller", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  assert.ok(
    src.includes(
      "return { response, toolResults, imageBlueprint: decision.imageBlueprint };",
    ),
    "generateNextAUIRState should return imageBlueprint for downstream usage",
  );
});

// ─── 4. runtime.ts forwards blueprint ──────────────────────────────────────

test("runtime.ts forwards imageBlueprint to postProcessImageUrls", () => {
  const src = readSrc("src/ai/runtime.ts");

  // When tool results exist, imageBlueprint should still be forwarded
  assert.ok(
    src.includes("genResult.imageBlueprint"),
    "runtime.ts should reference genResult.imageBlueprint for image URL post-processing",
  );
  // The non-fallback path should still call postProcessImageUrls with blueprint
  assert.ok(
    src.includes("postProcessImageUrls("),
    "runtime.ts should call postProcessImageUrls for image placeholder replacement",
  );
});

// ─── 5. Per-slot image search execution ────────────────────────────────────

test("generateNextState executes per-slot imageSearch for uncovered slots", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  assert.ok(
    src.includes("Phase 2.5-pre"),
    "generateNextState.ts should have Phase 2.5-pre for per-slot image searches",
  );
  assert.ok(
    src.includes("uncoveredSlots"),
    "generateNextState.ts should detect uncovered image slots",
  );
  assert.ok(
    src.includes("slot_img_${slot.slotId}"),
    "Per-slot search requests should use slot-specific IDs",
  );
  assert.ok(
    src.includes("Per-slot image search for:"),
    "Per-slot search requests should have descriptive reasons",
  );
});

test("buildSlotBindingMap uses modular arithmetic for out-of-range indices", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  assert.ok(
    src.includes("placeholderIndex % totalDownloaded"),
    "buildSlotBindingMap should use modular arithmetic to distribute images evenly",
  );
  assert.ok(
    !src.includes("Math.max(totalDownloaded - 1, 0)") ||
      src.indexOf("placeholderIndex % totalDownloaded") <
        src.indexOf("Math.max(totalDownloaded - 1, 0)"),
    "Modular arithmetic should replace the old 'last image' fallback",
  );
});

// ─── 6. IMAGE SLOT CONTRACT strength ───────────────────────────────────────

test("IMAGE SLOT CONTRACT includes critical rules for unique placeholders", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  assert.ok(
    src.includes("CRITICAL RULES"),
    "IMAGE SLOT CONTRACT should have CRITICAL RULES section",
  );
  assert.ok(
    src.includes("NEVER reuse the same placeholder"),
    "Should explicitly forbid reusing placeholders across slots",
  );
  assert.ok(
    src.includes("usedCandidateIndex"),
    "Should instruct AI to set different usedCandidateIndex per slot",
  );
});

// ─── 7. Domain diversity in URL selection ──────────────────────────────────

test("Phase 2.5 download loop tracks used domains for diversity", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  assert.ok(
    src.includes("usedDomains"),
    "Download loop should track used domains for diversity",
  );
  assert.ok(
    src.includes("getDomain"),
    "Should have a domain extraction helper",
  );
  assert.ok(
    src.includes("优先找来自新域名的 URL"),
    "Fallback should prefer URLs from new domains",
  );
});
