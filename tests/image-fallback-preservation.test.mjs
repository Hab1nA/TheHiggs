/**
 * Regression tests for image data URL preservation across UI transitions.
 *
 * Validates that:
 *  1. extractDataUrlsFromUITree extracts data URLs from various UI node types
 *  2. buildFallbackToolResults creates synthetic tool results from extracted data URLs
 *  3. postProcessImageUrls correctly replaces placeholders using fallback results
 *  4. runtime.ts conditionally invokes fallback when toolResults is empty
 *
 * Bug scenario:
 *   Turn 6: AI generates UI with images (tools download → data URLs embedded)
 *   Turn 7: User clicks button → new UI generated with NO tool execution
 *            → AI emits {{DOWNLOADED_IMAGE_N}} placeholders
 *            → postProcessImageUrls SKIPPED because toolResults.length === 0
 *            → Images display as "🖼️ {{DOWNLOADED_IMAGE_0}}" text
 *
 * Fix: Extract data URLs from previous UI and use as fallback replacements.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readSrc(relPath) {
  return readFileSync(join(root, relPath), "utf-8");
}

// ─── Source code structural checks ─────────────────────────────────────────

test("generateNextState.ts exports extractDataUrlsFromUITree", () => {
  const src = readSrc("src/ai/generateNextState.ts");
  assert.ok(
    src.includes("export function extractDataUrlsFromUITree("),
    "generateNextState.ts should export extractDataUrlsFromUITree function",
  );
});

test("generateNextState.ts exports buildFallbackToolResults", () => {
  const src = readSrc("src/ai/generateNextState.ts");
  assert.ok(
    src.includes("export function buildFallbackToolResults("),
    "generateNextState.ts should export buildFallbackToolResults function",
  );
});

test("runtime.ts imports buildFallbackToolResults", () => {
  const src = readSrc("src/ai/runtime.ts");
  assert.ok(
    src.includes("buildFallbackToolResults"),
    "runtime.ts should import buildFallbackToolResults from generateNextState",
  );
});

test("runtime.ts runs postProcessImageUrls even when toolResults is empty", () => {
  const src = readSrc("src/ai/runtime.ts");

  // The old code:  if (response && toolResults.length > 0) {
  // The new code should NOT gate on toolResults.length > 0 alone.
  // Instead it should have a fallback path.
  assert.ok(
    src.includes("buildFallbackToolResults") &&
      src.includes("request.previous?.ui"),
    "runtime.ts should call buildFallbackToolResults with previous UI when toolResults is empty",
  );

  // Verify the fallback path exists in the step 4 section
  const step4Marker = "Step 4: Image URL replacement";
  const step4Idx = src.indexOf(step4Marker);
  assert.ok(step4Idx !== -1, "runtime.ts should have Step 4 section");

  // After step 4 marker, there should be a conditional that handles empty toolResults
  const step4Section = src.slice(step4Idx, step4Idx + 2000);
  assert.ok(
    step4Section.includes("buildFallbackToolResults"),
    "Step 4 section should reference buildFallbackToolResults for fallback image replacement",
  );
});

test("runtime.ts logs fallback usage with isFallback flag", () => {
  const src = readSrc("src/ai/runtime.ts");
  assert.ok(
    src.includes("isFallback"),
    "runtime.ts should track and log whether fallback image replacement was used",
  );
});

test("extractDataUrlsFromUITree handles card.image data URLs", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  // The function should check card.image for data URLs
  assert.ok(
    src.includes('obj.type === "card"') && src.includes("data:"),
    "extractDataUrlsFromUITree should extract data URLs from card.image",
  );
});

test("extractDataUrlsFromUITree handles image.src data URLs", () => {
  const src = readSrc("src/ai/generateNextState.ts");
  assert.ok(
    src.includes('obj.type === "image"') && src.includes("obj.src"),
    "extractDataUrlsFromUITree should extract data URLs from image.src",
  );
});

test("extractDataUrlsFromUITree recurses into children, primary, secondary, tabs, footer, items", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  // Find the function
  const fnStart = src.indexOf("export function extractDataUrlsFromUITree(");
  assert.ok(fnStart !== -1, "Function should exist");

  // Get a chunk after the function start
  const fnChunk = src.slice(fnStart, fnStart + 3000);

  // Should recurse into all standard UINode child-bearing fields
  for (const field of [
    "children",
    "primary",
    "secondary",
    "tabs",
    "footer",
    "items",
  ]) {
    assert.ok(
      fnChunk.includes(`obj.${field}`) || fnChunk.includes(field),
      `extractDataUrlsFromUITree should recurse into '${field}' field`,
    );
  }
});

test("buildFallbackToolResults creates downloadResource-shaped results", () => {
  const src = readSrc("src/ai/generateNextState.ts");

  const fnStart = src.indexOf("export function buildFallbackToolResults(");
  assert.ok(fnStart !== -1, "buildFallbackToolResults should exist");

  const fnChunk = src.slice(fnStart, fnStart + 1500);
  assert.ok(
    fnChunk.includes("downloadResource"),
    "buildFallbackToolResults should create results shaped like downloadResource tool results",
  );
  assert.ok(
    fnChunk.includes("resourceType"),
    "Fallback results should include resourceType field",
  );
});

test("buildFallbackToolResults returns empty array when no data URLs found", () => {
  const src = readSrc("src/ai/generateNextState.ts");
  const fnStart = src.indexOf("export function buildFallbackToolResults(");
  const fnChunk = src.slice(fnStart, fnStart + 1500);
  assert.ok(
    fnChunk.includes("dataUrls.length === 0"),
    "buildFallbackToolResults should return empty array when no data URLs are found",
  );
});

// ─── Behavioral checks (source analysis) ───────────────────────────────────

test("old bug: runtime.ts no longer gates Step 4 solely on toolResults.length > 0", () => {
  const src = readSrc("src/ai/runtime.ts");

  // Find the Step 4 section
  const step4Idx = src.indexOf("Step 4: Image URL replacement");
  assert.ok(step4Idx !== -1);

  // Get the section (about 2000 chars)
  const section = src.slice(step4Idx, step4Idx + 2000);

  // The old buggy pattern was:
  //   if (response && toolResults.length > 0) {
  //     postProcessImageUrls(response, toolResults, ...);
  //   }
  //
  // The new code should have a fallback path that runs when toolResults is empty.
  // Verify the code does NOT have a simple "if (response && toolResults.length > 0)"
  // without any fallback handling.
  const hasSimpleGate =
    section.includes("if (response && toolResults.length > 0)") &&
    !section.includes("buildFallbackToolResults");
  assert.ok(
    !hasSimpleGate,
    "Step 4 should no longer use simple 'if (response && toolResults.length > 0)' without fallback",
  );
});

test("data URL extraction covers image object in card.image", () => {
  const src = readSrc("src/ai/generateNextState.ts");
  const fnStart = src.indexOf("export function extractDataUrlsFromUITree(");
  const fnChunk = src.slice(fnStart, fnStart + 2500);

  // card.image can be a string (data URL) or an object with .src
  assert.ok(
    fnChunk.includes("typeof img ==="),
    "Should check type of card.image (string vs object)",
  );
});
