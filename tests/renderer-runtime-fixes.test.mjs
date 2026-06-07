/**
 * Regression tests for renderer runtime fixes (2026-06-07).
 *
 * Covers the 7 issues from the investigation report:
 *  1. Input components fire component.commit events
 *  2. AI transition buttons default to including local state snapshot
 *  3. createClientSnapshot collects visible bindings from current UI
 *  4. Post-process validates against schema (toggle removed)
 *  5. CardRender uses <img> for image display
 *  6. TabsRender syncs activeTab with useEffect
 *  7. ErrorPanel retry logic preserves event for re-dispatch
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readSrc(relPath) {
  return readFileSync(join(root, relPath), "utf-8");
}

// ─── Issue #1: Input components fire component.commit ───────────────────────

test("Issue #1: TextInputRender fires commit on blur/enter triggers", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  // TextInputRender should have fireCommit function
  assert.ok(
    src.includes("function TextInputRender("),
    "TextInputRender should exist",
  );

  // Should call fireCommit with "blur" trigger
  assert.ok(
    src.includes('fireCommit("blur")'),
    "TextInputRender should fire commit on blur",
  );

  // Should call fireCommit with "enter" trigger on keydown
  assert.ok(
    src.includes('if (e.key === "Enter") fireCommit("enter")'),
    "TextInputRender should fire commit on Enter key",
  );

  // Should check interaction.mode === "ai_transition"
  assert.ok(
    src.includes('interaction?.mode === "ai_transition"'),
    "TextInputRender should check for ai_transition mode",
  );
});

test("Issue #1: NumberInputRender fires commit on blur/enter triggers", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  assert.ok(
    src.includes("function NumberInputRender("),
    "NumberInputRender should exist",
  );
  assert.ok(
    src.includes('fireCommit("blur")'),
    "NumberInputRender should fire commit on blur",
  );
});

test("Issue #1: TextareaRender fires commit on blur trigger", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  assert.ok(
    src.includes("function TextareaRender("),
    "TextareaRender should exist",
  );
  // TextareaRender should also have fireCommit
  const textareaStart = src.indexOf("function TextareaRender(");
  const textareaEnd = src.indexOf("function SelectRender(");
  const textareaCode = src.slice(textareaStart, textareaEnd);
  assert.ok(
    textareaCode.includes('fireCommit("blur")'),
    "TextareaRender should fire commit on blur",
  );
});

test("Issue #1: SelectRender fires commit on change trigger", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  const selectStart = src.indexOf("function SelectRender(");
  const selectEnd = src.indexOf("function CheckboxRender(");
  const selectCode = src.slice(selectStart, selectEnd);
  assert.ok(
    selectCode.includes('fireCommit("change", next)'),
    "SelectRender should fire commit on change",
  );
});

test("Issue #1: CheckboxRender fires commit on change trigger", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  const cbStart = src.indexOf("function CheckboxRender(");
  const cbEnd = src.indexOf("function SliderRender(");
  const cbCode = src.slice(cbStart, cbEnd);
  assert.ok(
    cbCode.includes('fireCommit("change", next)'),
    "CheckboxRender should fire commit on change",
  );
});

test("Issue #1: SliderRender fires commit on change trigger", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  const sliderStart = src.indexOf("function SliderRender(");
  const sliderEnd = src.indexOf("function StepperRender(");
  const sliderCode = src.slice(sliderStart, sliderEnd);
  assert.ok(
    sliderCode.includes('fireCommit("change", next)'),
    "SliderRender should fire commit on change",
  );
});

test("Issue #1: StepperRender fires commit on change trigger", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  const stepperStart = src.indexOf("function StepperRender(");
  const stepperEnd = src.indexOf("// ---", stepperStart + 1);
  const stepperCode = src.slice(stepperStart, stepperEnd);
  assert.ok(
    stepperCode.includes("fireCommit(nxt)"),
    "StepperRender should fire commit on increment/decrement",
  );
});

test("Issue #1: All input components use createComponentCommitEvent", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  // Count how many times createComponentCommitEvent is imported/used
  const matches = src.match(/createComponentCommitEvent/g);
  assert.ok(
    matches && matches.length >= 7,
    `Expected at least 7 uses of createComponentCommitEvent, got ${matches?.length ?? 0}`,
  );
});

// ─── Issue #2: AI transition button default snapshot strategy ───────────────

test("Issue #2: Button defaults to including snapshot (includeLocalStateOnCommit !== false)", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  const btnStart = src.indexOf("function ButtonRender(");
  const btnEnd = src.indexOf("function TextInputRender(");
  const btnCode = src.slice(btnStart, btnEnd);

  // Should check !== false (default include), not check === true (default exclude)
  assert.ok(
    btnCode.includes("interaction?.includeLocalStateOnCommit !== false"),
    "Button should default to including snapshot (check !== false, not === true)",
  );

  // Should NOT have the old pattern that only includes when explicitly true
  assert.ok(
    !btnCode.includes(
      "interaction?.includeLocalStateOnCommit\n            ? createClientSnapshot",
    ),
    "Button should not use the old conditional-only-when-true pattern",
  );
});

// ─── Issue #3: createClientSnapshot uses currentUI from context ─────────────

test("Issue #3: CurrentUIContext is created and provided", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  // Context should be created
  assert.ok(
    src.includes(
      "const CurrentUIContext = React.createContext<UINode | null>(null)",
    ),
    "CurrentUIContext should be created",
  );

  // Context should be provided in Renderer
  assert.ok(
    src.includes("<CurrentUIContext.Provider value={node}>"),
    "CurrentUIContext.Provider should wrap rendered content",
  );

  // useCurrentUI hook should exist
  assert.ok(
    src.includes("function useCurrentUI(): UINode | null"),
    "useCurrentUI hook should exist",
  );
});

test("Issue #3: ButtonRender passes currentUI to createClientSnapshot", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  const btnStart = src.indexOf("function ButtonRender(");
  const btnEnd = src.indexOf("function TextInputRender(");
  const btnCode = src.slice(btnStart, btnEnd);

  // Should use useCurrentUI()
  assert.ok(
    btnCode.includes("const currentUI = useCurrentUI()"),
    "ButtonRender should use useCurrentUI()",
  );

  // Should pass currentUI (not null) to createClientSnapshot
  assert.ok(
    btnCode.includes("createClientSnapshot(localState, currentUI ?? null)"),
    "ButtonRender should pass currentUI to createClientSnapshot",
  );
});

test("Issue #3: All createClientSnapshot calls use currentUI (not hardcoded null)", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  // There should be NO createClientSnapshot(localState, null) calls
  // All should use currentUI ?? null
  const nullCalls = src.match(/createClientSnapshot\(localState, null\)/g);
  assert.ok(
    !nullCalls || nullCalls.length === 0,
    `Found ${nullCalls?.length ?? 0} hardcoded null calls to createClientSnapshot; should use currentUI`,
  );
});

test("Issue #3: TabsRender uses currentUI for snapshot", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  const tabsStart = src.indexOf("function TabsRender(");
  const tabsEnd = src.indexOf("function ModalRender(");
  const tabsCode = src.slice(tabsStart, tabsEnd);

  assert.ok(
    tabsCode.includes("const currentUI = useCurrentUI()"),
    "TabsRender should use useCurrentUI()",
  );
  assert.ok(
    tabsCode.includes("createClientSnapshot(localState, currentUI ?? null)"),
    "TabsRender should pass currentUI to createClientSnapshot",
  );
});

// ─── Issue #4: Post-process schema validation + no toggle ───────────────────

test("Issue #4: toggle is not a valid UI node type in schema", () => {
  const src = readSrc("src/auir/schema.ts");

  // The discriminated union should NOT include a toggle literal
  const unionStart = src.indexOf(
    "export const uiNodeSchema = z.discriminatedUnion",
  );
  const unionEnd = src.indexOf("]);", unionStart);
  const unionCode = src.slice(unionStart, unionEnd);
  assert.ok(
    !unionCode.includes('"toggle"'),
    "toggle should not be in the uiNodeSchema discriminated union",
  );
});

test("Issue #4: post-process output is validated against schema in runtime", () => {
  const src = readSrc("src/ai/runtime.ts");

  // After post-process, there should be a validateResponse call
  assert.ok(
    src.includes("const ppValidation = validateResponse("),
    "Post-process output should be validated against schema",
  );

  // Should revert on validation failure
  assert.ok(
    src.includes("response.next.ui = originalUI"),
    "Should revert to original UI on post-process validation failure",
  );
});

test("Issue #4: postProcessUI.ts does not reference toggle as component type", () => {
  const src = readSrc("src/ai/postProcessUI.ts");

  // Should not list toggle as a component type in the reference
  assert.ok(
    !src.match(/toggle\s*\{[^}]*\}/),
    "postProcessUI should not define toggle as a component type",
  );
});

test("Issue #4: refinePrompt.ts does not reference toggle as component type", () => {
  const src = readSrc("src/ai/refinePrompt.ts");

  // Should not have "toggle" as a standalone component in component lists
  // Note: "toggle" as a verb in natural language is fine
  const lines = src.split("\n");
  for (const line of lines) {
    // Skip lines where "toggle" is used as a verb in natural language
    if (
      line.includes("toggle") &&
      (line.includes("type:") ||
        line.includes('"toggle"') ||
        line.includes("'toggle'"))
    ) {
      assert.fail(
        `refinePrompt.ts references toggle as component type: ${line.trim()}`,
      );
    }
  }
});

// ─── Issue #5: CardRender displays images with <img> tag ────────────────────

test("Issue #5: CardRender uses <img> tag for image display", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  const cardStart = src.indexOf("function CardRender(");
  const cardEnd = src.indexOf("function DescriptionListRender(");
  const cardCode = src.slice(cardStart, cardEnd);

  // Should use <img> tag, not just display URL text
  assert.ok(
    cardCode.includes("<img"),
    "CardRender should use <img> tag for image display",
  );

  // Should have data URL and https URL validation
  assert.ok(
    cardCode.includes('src.startsWith("data:")'),
    "CardRender should accept data: URLs",
  );
  assert.ok(
    cardCode.includes('src.startsWith("https://")'),
    "CardRender should accept https: URLs",
  );

  // Should have fallback for invalid URLs
  assert.ok(
    cardCode.includes("onError"),
    "CardRender should have error fallback for broken images",
  );
});

// ─── Issue #6: TabsRender syncs activeTab with useEffect ────────────────────

test("Issue #6: TabsRender uses useEffect to sync activeTab prop", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  const tabsStart = src.indexOf("function TabsRender(");
  const tabsEnd = src.indexOf("function ModalRender(");
  const tabsCode = src.slice(tabsStart, tabsEnd);

  // Should have useEffect for activeTab sync
  assert.ok(
    tabsCode.includes("useEffect("),
    "TabsRender should have useEffect for activeTab sync",
  );

  // Should set activeTab in the effect
  assert.ok(
    tabsCode.includes("setActiveTab(String(n.activeTab))"),
    "TabsRender useEffect should update activeTab from prop",
  );

  // Should depend on n.activeTab
  assert.ok(
    tabsCode.includes("[n.activeTab]"),
    "TabsRender useEffect should depend on n.activeTab",
  );
});

// ─── Issue #7: ErrorPanel retry re-dispatches last event ────────────────────

test("Issue #7: page.tsx saves last event in ref for retry", () => {
  const src = readSrc("app/page.tsx");

  // Should have a ref to store last event
  assert.ok(
    src.includes("const lastEventRef = useRef<AUIREvent | null>(null)"),
    "page.tsx should have lastEventRef",
  );

  // Should save event at start of handleAIEvent
  assert.ok(
    src.includes("lastEventRef.current = event"),
    "handleAIEvent should save the event to lastEventRef",
  );
});

test("Issue #7: handleRetry re-dispatches last event (not full reset)", () => {
  const src = readSrc("app/page.tsx");

  // handleRetry should exist
  assert.ok(
    src.includes("const handleRetry = useCallback"),
    "handleRetry should exist",
  );

  // Should call handleAIEvent with saved event
  assert.ok(
    src.includes("await handleAIEvent(lastEventRef.current)"),
    "handleRetry should call handleAIEvent with last event",
  );

  // Should fallback to handleRestart only when no saved event
  assert.ok(
    src.includes("await handleRestart()"),
    "handleRetry should fallback to handleRestart when no event",
  );
});

test("Issue #7: ErrorPanel uses handleRetry (not handleRestart)", () => {
  const src = readSrc("app/page.tsx");

  // ErrorPanel should be bound to handleRetry
  assert.ok(
    src.includes("<ErrorPanel message={error} onRetry={handleRetry} />"),
    "ErrorPanel should use handleRetry",
  );

  // Should NOT be bound to handleRestart directly
  assert.ok(
    !src.includes("<ErrorPanel message={error} onRetry={handleRestart} />"),
    "ErrorPanel should NOT use handleRestart directly",
  );
});

// ─── Event system completeness ──────────────────────────────────────────────

test("createComponentCommitEvent exists and is exported", () => {
  const src = readSrc("src/runtime/event.ts");

  assert.ok(
    src.includes("export function createComponentCommitEvent("),
    "createComponentCommitEvent should be exported",
  );

  // Should create proper event structure
  assert.ok(
    src.includes('type: "component.commit"'),
    "createComponentCommitEvent should create component.commit events",
  );
});

test("createClientSnapshot accepts UINode | null for currentUI", () => {
  const src = readSrc("src/runtime/event.ts");

  assert.ok(
    src.includes("currentUI: UINode | null"),
    "createClientSnapshot should accept UINode | null",
  );
});

// ─── ALLOWED_COMPONENTS validation is covered by schema-validation-regression.test.mjs ──

// ─── CP-5: Component metadata in setLocalValue ─────────────────────────────

test("CP-5: ComponentInteractionMeta type is exported from Renderer.tsx", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  assert.ok(
    src.includes("export type ComponentInteractionMeta"),
    "ComponentInteractionMeta should be exported",
  );
  assert.ok(
    src.includes("componentId: string"),
    "ComponentInteractionMeta should have componentId",
  );
  assert.ok(
    src.includes("componentType: string"),
    "ComponentInteractionMeta should have componentType",
  );
  assert.ok(
    src.includes("label?: string"),
    "ComponentInteractionMeta should have optional label",
  );
  assert.ok(
    src.includes("interactionMode?: string"),
    "ComponentInteractionMeta should have optional interactionMode",
  );
});

test("CP-5: RendererProps setLocalValue accepts optional meta parameter", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  assert.ok(
    src.includes("meta?: ComponentInteractionMeta"),
    "setLocalValue in RendererProps should accept optional meta",
  );
});

test("CP-5: All input components pass metadata to setLocalValue", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  const inputComponents = [
    "TextInputRender",
    "NumberInputRender",
    "TextareaRender",
    "SelectRender",
    "CheckboxRender",
    "SliderRender",
    "StepperRender",
  ];

  for (const comp of inputComponents) {
    const fnStart = src.indexOf(`function ${comp}(`);
    assert.ok(fnStart >= 0, `${comp} should exist`);

    // Find the end of this component function (next function declaration)
    const nextFn = src.indexOf("\nfunction ", fnStart + 1);
    const fnCode = src.slice(fnStart, nextFn > 0 ? nextFn : src.length);

    assert.ok(
      fnCode.includes("componentId:"),
      `${comp} should pass componentId metadata to setLocalValue`,
    );
    assert.ok(
      fnCode.includes(`componentType: "`),
      `${comp} should pass componentType metadata to setLocalValue`,
    );
  }
});

test("CP-5: page.tsx handleSetLocalValue includes component metadata in log payload", () => {
  const src = readSrc("app/page.tsx");

  assert.ok(
    src.includes("meta?:"),
    "handleSetLocalValue should accept optional meta parameter",
  );
  assert.ok(
    src.includes("component: meta"),
    "handleSetLocalValue should include component metadata in payload",
  );
});

// ─── CP-2: postRuntimeLog checks res.ok ─────────────────────────────────────

test("CP-2: postRuntimeLog checks response status", () => {
  const src = readSrc("src/runtime/client.ts");

  assert.ok(src.includes("if (!res.ok)"), "postRuntimeLog should check res.ok");
  assert.ok(
    src.includes("server rejected log event"),
    "postRuntimeLog should warn when server rejects log event",
  );
});

// ─── CP-6: AI fallback uses 206 status ──────────────────────────────────────

test("CP-6: /api/ai-ui returns 206 for simulated fallback responses", () => {
  const src = readSrc("app/api/ai-ui/route.ts");

  assert.ok(
    src.includes("isFallback ? 206 : 200"),
    "Should return 206 for fallback responses",
  );
  assert.ok(
    src.includes("simulatedData === true"),
    "Should check simulatedData to determine fallback status",
  );
});

// ─── CP-7: Refine frontend failures write to runtime log ────────────────────

test("CP-7: SearchLauncher imports postRuntimeLog", () => {
  const src = readSrc("src/components/SearchLauncher.tsx");

  assert.ok(
    src.includes('import { postRuntimeLog } from "@/runtime/client"'),
    "SearchLauncher should import postRuntimeLog",
  );
});

test("CP-7: SearchLauncher logs refine HTTP errors", () => {
  const src = readSrc("src/components/SearchLauncher.tsx");

  assert.ok(
    src.includes("refine.frontend.http_error"),
    "Should log refine HTTP error events",
  );
  assert.ok(
    src.includes("refine.frontend.business_failure"),
    "Should log refine business failure events",
  );
  assert.ok(
    src.includes("refine.frontend.fetch_error"),
    "Should log refine fetch error events",
  );
});

// ─── CP-4: Validation failures log to runtime ───────────────────────────────

test("CP-4: /api/ai-ui logs validation failures", () => {
  const src = readSrc("app/api/ai-ui/route.ts");

  assert.ok(
    src.includes("api.ai_ui.validation.failed"),
    "Should log validation failure events",
  );
  assert.ok(
    src.includes("logValidationFailure"),
    "Should have logValidationFailure helper function",
  );
});
