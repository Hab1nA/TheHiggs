/**
 * Tests for AUIR Deterministic Post-Processor.
 *
 * Covers:
 *  1. Rule 1: Interaction completeness (semanticRole, intent, commitOn, binding, interactionMode)
 *  2. Rule 2: Interactive minimum (auto-add navigation button)
 *  3. Rule 3: Accessibility (image alt, heading text, alert message)
 *  4. Rule 4: Spacing consistency (default gap on containers)
 *  5. Rule 5: Style consistency (density cascade)
 *  6. Rule 6: localAction target validation
 *  7. Edge cases: empty screen, deeply nested nodes, already-correct UI
 */

import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const outDir = join(root, ".test-build-dpp");

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
    include: ["src/auir/deterministicPostProcess.ts", "src/auir/types.ts"],
  };

  const tsconfigPath = join(root, "tsconfig.test-dpp.json");
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

async function importModule(relativePath) {
  const fullPath = join(outDir, relativePath);
  return import(pathToFileURL(fullPath).href);
}

let dpp;

test.before(async () => {
  compileSources();
  dpp = await importModule("deterministicPostProcess.js");
});

// ─── Rule 1: Interaction Completeness ─────────────────────────

test("Rule 1: button missing semanticRole gets 'navigation'", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [{ id: "btn", type: "button", label: "Go", intent: "go" }],
  };
  const result = dpp.deterministicPostProcess(ui);
  assert.equal(ui.children[0].semanticRole, "navigation");
  assert.ok(result.fixes.some((f) => f.kind === "semanticRole.autofix"));
});

test("Rule 1: text_input missing semanticRole gets 'input'", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [{ id: "inp", type: "text_input", binding: "x" }],
  };
  dpp.deterministicPostProcess(ui);
  assert.equal(ui.children[0].semanticRole, "input");
});

test("Rule 1: button missing intent gets default", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      { id: "btn", type: "button", label: "Click", semanticRole: "navigation" },
    ],
  };
  dpp.deterministicPostProcess(ui);
  assert.equal(ui.children[0].intent, "action_btn");
});

test("Rule 1: ai_transition button missing commitOn gets ['click']", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      {
        id: "btn",
        type: "button",
        label: "Run",
        intent: "run",
        semanticRole: "navigation",
        interaction: { mode: "ai_transition" },
      },
    ],
  };
  dpp.deterministicPostProcess(ui);
  assert.deepEqual(ui.children[0].interaction.commitOn, ["click"]);
  assert.equal(ui.children[0].interaction.includeLocalStateOnCommit, true);
});

test("Rule 1: text_input missing binding gets default", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [{ id: "inp", type: "text_input", semanticRole: "input" }],
  };
  dpp.deterministicPostProcess(ui);
  assert.equal(ui.children[0].binding, "input_inp");
});

test("Rule 1: text_input missing interaction gets mode='local'", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      { id: "inp", type: "text_input", binding: "x", semanticRole: "input" },
    ],
  };
  dpp.deterministicPostProcess(ui);
  assert.deepEqual(ui.children[0].interaction, { mode: "local" });
});

test("Rule 1: external_link missing url gets '#'", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      {
        id: "link",
        type: "external_link",
        label: "Docs",
        semanticRole: "navigation",
      },
    ],
  };
  dpp.deterministicPostProcess(ui);
  assert.equal(ui.children[0].url, "#");
});

test("Rule 1: already-correct button gets no interaction-related fixes", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      {
        id: "btn",
        type: "button",
        label: "Go",
        intent: "go",
        semanticRole: "navigation",
        style: { density: "normal" },
        interaction: {
          mode: "ai_transition",
          commitOn: ["click"],
          includeLocalStateOnCommit: true,
        },
      },
    ],
  };
  const result = dpp.deterministicPostProcess(ui);
  const buttonFixes = result.fixes.filter(
    (f) =>
      f.nodeId === "btn" &&
      !f.kind.startsWith("density.") &&
      !f.kind.startsWith("gap."),
  );
  assert.equal(
    buttonFixes.length,
    0,
    `No interaction fixes expected, got: ${JSON.stringify(buttonFixes)}`,
  );
});

// ─── Rule 2: Interactive Minimum ──────────────────────────────

test("Rule 2: screen with 0 interactive controls gets auto button", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Empty",
    gap: "md",
    children: [{ id: "h", type: "heading", text: "Hello", level: 1 }],
  };
  const result = dpp.deterministicPostProcess(ui);
  assert.equal(
    result.fixes.some((f) => f.kind === "interactiveMinimum.autofix"),
    true,
  );
  // Verify the button was actually added
  const btn = ui.children.find((c) => c.id === "auto_nav_button");
  assert.ok(btn, "auto_nav_button should be added");
  assert.equal(btn.type, "button");
});

test("Rule 2: screen with existing interactive controls gets no auto button", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "HasBtn",
    gap: "md",
    children: [
      {
        id: "btn",
        type: "button",
        label: "Go",
        intent: "go",
        semanticRole: "navigation",
      },
    ],
  };
  const result = dpp.deterministicPostProcess(ui);
  assert.equal(
    result.fixes.some((f) => f.kind === "interactiveMinimum.autofix"),
    false,
  );
});

// ─── Rule 3: Accessibility ────────────────────────────────────

test("Rule 3: image missing alt gets fallback", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      {
        id: "btn",
        type: "button",
        label: "Go",
        intent: "go",
        semanticRole: "navigation",
      },
      { id: "img", type: "image", src: "https://example.com/img.jpg" },
    ],
  };
  dpp.deterministicPostProcess(ui);
  const img = ui.children.find((c) => c.id === "img");
  assert.equal(img.alt, "图片");
});

test("Rule 3: image with caption uses caption as alt", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      {
        id: "btn",
        type: "button",
        label: "Go",
        intent: "go",
        semanticRole: "navigation",
      },
      {
        id: "img",
        type: "image",
        src: "https://example.com/img.jpg",
        caption: "A photo",
      },
    ],
  };
  dpp.deterministicPostProcess(ui);
  const img = ui.children.find((c) => c.id === "img");
  assert.equal(img.alt, "A photo");
});

test("Rule 3: heading missing text gets empty string", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      {
        id: "btn",
        type: "button",
        label: "Go",
        intent: "go",
        semanticRole: "navigation",
      },
      { id: "h", type: "heading", level: 2 },
    ],
  };
  dpp.deterministicPostProcess(ui);
  const h = ui.children.find((c) => c.id === "h");
  assert.equal(h.text, "");
});

test("Rule 3: alert missing message gets fallback", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      {
        id: "btn",
        type: "button",
        label: "Go",
        intent: "go",
        semanticRole: "navigation",
      },
      { id: "a", type: "alert", tone: "warning" },
    ],
  };
  dpp.deterministicPostProcess(ui);
  const a = ui.children.find((c) => c.id === "a");
  assert.equal(a.message, "（无消息内容）");
});

// ─── Rule 4: Spacing Consistency ──────────────────────────────

test("Rule 4: container missing gap gets 'md'", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      {
        id: "btn",
        type: "button",
        label: "Go",
        intent: "go",
        semanticRole: "navigation",
      },
      { id: "c", type: "container", direction: "row", children: [] },
    ],
  };
  dpp.deterministicPostProcess(ui);
  const c = ui.children.find((c) => c.id === "c");
  assert.equal(c.gap, "md");
});

test("Rule 4: container with explicit gap='none' is preserved", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      {
        id: "btn",
        type: "button",
        label: "Go",
        intent: "go",
        semanticRole: "navigation",
      },
      {
        id: "c",
        type: "container",
        direction: "row",
        gap: "none",
        children: [],
      },
    ],
  };
  dpp.deterministicPostProcess(ui);
  const c = ui.children.find((c) => c.id === "c");
  assert.equal(c.gap, "none");
});

// ─── Rule 6: localAction Target Validation ────────────────────

test("Rule 6: append_text with missing targetBinding logs warning fix", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      {
        id: "btn",
        type: "button",
        label: "Go",
        intent: "go",
        semanticRole: "navigation",
      },
      {
        id: "kb",
        type: "button",
        label: "sin(",
        intent: "append_sin",
        semanticRole: "input",
        localAction: {
          type: "append_text",
          targetBinding: "nonexistent",
          text: "sin(",
        },
      },
    ],
  };
  const result = dpp.deterministicPostProcess(ui);
  assert.ok(result.fixes.some((f) => f.kind === "localAction.targetMissing"));
});

test("Rule 6: append_text with valid targetBinding gets no fix", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      {
        id: "btn",
        type: "button",
        label: "Go",
        intent: "go",
        semanticRole: "navigation",
      },
      {
        id: "inp",
        type: "text_input",
        binding: "formula",
        semanticRole: "input",
        interaction: { mode: "local" },
      },
      {
        id: "kb",
        type: "button",
        label: "sin(",
        intent: "append_sin",
        semanticRole: "input",
        localAction: {
          type: "append_text",
          targetBinding: "formula",
          text: "sin(",
        },
      },
    ],
  };
  const result = dpp.deterministicPostProcess(ui);
  assert.equal(
    result.fixes.some((f) => f.kind === "localAction.targetMissing"),
    false,
  );
});

// ─── Edge Cases ───────────────────────────────────────────────

test("Edge: deeply nested nodes are all visited", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      {
        id: "btn",
        type: "button",
        label: "Go",
        intent: "go",
        semanticRole: "navigation",
      },
      {
        id: "split",
        type: "split",
        orientation: "horizontal",
        ratio: "1:1",
        primary: {
          id: "p",
          type: "panel",
          title: "Left",
          gap: "md",
          children: [{ id: "deep_inp", type: "text_input" }],
        },
        secondary: {
          id: "c",
          type: "container",
          direction: "column",
          gap: "md",
          children: [{ id: "deep_btn", type: "button", label: "Deep" }],
        },
      },
    ],
  };
  dpp.deterministicPostProcess(ui);
  // Deep input should get binding
  assert.equal(ui.children[1].primary.children[0].binding, "input_deep_inp");
  // Deep button should get semanticRole
  assert.equal(ui.children[1].secondary.children[0].semanticRole, "navigation");
});

test("Edge: empty screen (no children) still works", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Empty",
    gap: "md",
    children: [],
  };
  const result = dpp.deterministicPostProcess(ui);
  // Should add auto button
  assert.ok(result.fixes.some((f) => f.kind === "interactiveMinimum.autofix"));
  assert.equal(ui.children.length, 1);
});

test("Edge: result.fixCount matches result.fixes.length", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [
      { id: "btn", type: "button", label: "Go", intent: "go" },
      { id: "inp", type: "text_input" },
    ],
  };
  const result = dpp.deterministicPostProcess(ui);
  assert.equal(result.fixCount, result.fixes.length);
  assert.ok(result.fixCount > 0);
});

test("Edge: ui reference is the same object (in-place mutation)", () => {
  const ui = {
    id: "s",
    type: "screen",
    title: "Test",
    gap: "md",
    children: [{ id: "btn", type: "button", label: "Go", intent: "go" }],
  };
  const result = dpp.deterministicPostProcess(ui);
  assert.equal(result.ui, ui, "Should return the same reference");
});
