// ============================================================
// AUIR Renderer — 将 AUIR State 渲染为 React UI
// ============================================================

"use client";

import type { AUIREvent, LocalUIState, UINode } from "@/auir/types";
import React, { useCallback } from "react";
import { resolveBindingValue } from "./bindings";

// -----------------------------------------------------------
// Spacing System — density token → Tailwind class resolution
// -----------------------------------------------------------

/** Density → gap size mapping (used when explicit gap is not specified) */
const DENSITY_DEFAULT_GAP: Record<string, string> = {
  compact: "sm",
  normal: "md",
  spacious: "lg",
};

/** Gap size → Tailwind gap class */
const GAP_CLASS: Record<string, string> = {
  none: "",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
};

/** Density → Tailwind padding class */
const DENSITY_PADDING: Record<string, string> = {
  compact: "p-2",
  normal: "p-4",
  spacious: "p-6",
};

/** Density → Tailwind space-y class (for non-flex containers) */
const DENSITY_SPACE_Y: Record<string, string> = {
  compact: "space-y-1",
  normal: "space-y-2",
  spacious: "space-y-3",
};

/**
 * Resolve the effective density from a node.
 * Falls back to "normal" if not specified.
 */
function getNodeDensity(n: Record<string, unknown>): string {
  const style = n.style as { density?: string } | undefined;
  return style?.density ?? "normal";
}

/**
 * Resolve the gap Tailwind class for a layout node.
 * Priority: explicit gap (unless "none") → density default → "md"
 */
function resolveGapClass(n: Record<string, unknown>): string {
  const explicitGap = n.gap as string | undefined;
  if (explicitGap === "none") return ""; // explicitly no gap
  const gapSize = explicitGap ?? DENSITY_DEFAULT_GAP[getNodeDensity(n)] ?? "md";
  return GAP_CLASS[gapSize] ?? "gap-4";
}

/** Resolve padding class from density */
function resolvePadClass(n: Record<string, unknown>): string {
  return DENSITY_PADDING[getNodeDensity(n)] ?? "p-4";
}

/** Resolve space-y class from density */
function resolveSpaceYClass(n: Record<string, unknown>): string {
  return DENSITY_SPACE_Y[getNodeDensity(n)] ?? "space-y-2";
}

// -----------------------------------------------------------
// Renderer Props
// -----------------------------------------------------------

export type RendererProps = {
  node: UINode;
  localState: LocalUIState;
  setLocalValue: (binding: string, value: unknown) => void;
  onAIEvent: (event: AUIREvent) => void;
};

// -----------------------------------------------------------
// Main Renderer — type-narrow via cast to access discriminated fields
// -----------------------------------------------------------

export default function Renderer({
  node,
  localState,
  setLocalValue,
  onAIEvent,
}: RendererProps) {
  if (!node || node.visible === false) return null;

  // Use explicit narrowing by type + cast for field access
  const n = node as Record<string, unknown>;
  const t = node.type;

  if (t === "screen")
    return (
      <ScreenRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "container")
    return (
      <ContainerRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "grid")
    return (
      <GridRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "split")
    return (
      <SplitRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "region")
    return (
      <RegionRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "toolbar")
    return (
      <ToolbarRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "spacer") return <SpacerRender n={n} />;
  if (t === "divider") return <DividerRender n={n} />;
  if (t === "panel")
    return (
      <PanelRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "tabs")
    return (
      <TabsRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "modal")
    return (
      <ModalRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "drawer")
    return (
      <DrawerRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "heading") return <HeadingRender n={n} />;
  if (t === "text") return <TextRender n={n} />;
  if (t === "table") return <TableRender n={n} />;
  if (t === "metric") return <MetricRender n={n} />;
  if (t === "alert") return <AlertRender n={n} />;
  if (t === "code_block") return <CodeBlockRender n={n} />;
  if (t === "chart_bar") return <ChartBarRender n={n} />;
  if (t === "chart_line") return <ChartLineRender n={n} />;
  if (t === "button")
    return (
      <ButtonRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "text_input")
    return (
      <TextInputRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "number_input")
    return (
      <NumberInputRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "textarea")
    return (
      <TextareaRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
      />
    );
  if (t === "select")
    return (
      <SelectRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
      />
    );
  if (t === "checkbox")
    return (
      <CheckboxRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
      />
    );
  if (t === "slider")
    return (
      <SliderRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
      />
    );
  if (t === "stepper")
    return (
      <StepperRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
      />
    );
  if (t === "local_value_display")
    return <LocalValueDisplayRender n={n} localState={localState} />;

  return <div className="text-neutral-500 text-xs p-2">Unknown: {t}</div>;
}

// -----------------------------------------------------------
// Children rendering helper
// -----------------------------------------------------------

function RenderKids({
  kids,
  localState,
  setLocalValue,
  onAIEvent,
}: {
  kids: UINode[];
  localState: LocalUIState;
  setLocalValue: (b: string, v: unknown) => void;
  onAIEvent: (e: AUIREvent) => void;
}) {
  return (
    <>
      {kids.map((c) => (
        <Renderer
          key={c.id}
          node={c}
          localState={localState}
          setLocalValue={setLocalValue}
          onAIEvent={onAIEvent}
        />
      ))}
    </>
  );
}

type RProps = {
  n: Record<string, unknown>;
  localState: LocalUIState;
  setLocalValue: (b: string, v: unknown) => void;
  onAIEvent: (e: AUIREvent) => void;
};
type RSimple = { n: Record<string, unknown> };
type RLocal = {
  n: Record<string, unknown>;
  localState: LocalUIState;
  setLocalValue: (b: string, v: unknown) => void;
};
type RLocalView = { n: Record<string, unknown>; localState: LocalUIState };

// -----------------------------------------------------------
// Layout
// -----------------------------------------------------------

function ScreenRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const layoutMode = String(n.layoutMode ?? "single");
  const gap = resolveGapClass(n);
  if (layoutMode === "single") {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-neutral-100 ${resolvePadClass(n)} ${gap}`}
      >
        <RenderKids
          kids={n.children as UINode[]}
          localState={localState}
          setLocalValue={setLocalValue}
          onAIEvent={onAIEvent}
        />
      </div>
    );
  }
  return (
    <div
      className={`min-h-screen bg-neutral-950 text-neutral-100 flex flex-col ${gap}`}
    >
      {n.title ? (
        <h1 className="text-2xl font-bold mb-1 px-4 pt-4">{String(n.title)}</h1>
      ) : null}
      <div className={resolvePadClass(n)}>
        <RenderKids
          kids={n.children as UINode[]}
          localState={localState}
          setLocalValue={setLocalValue}
          onAIEvent={onAIEvent}
        />
      </div>
    </div>
  );
}

function ContainerRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const dir = String(n.direction ?? "column");
  const gap = resolveGapClass(n);
  const cols = Number(n.columns ?? 2);
  const gridColsMap: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  };
  const flex =
    dir === "row"
      ? "flex flex-row"
      : dir === "grid"
        ? `grid ${gridColsMap[cols] ?? "grid-cols-2"}`
        : "flex flex-col";
  return (
    <div className={`${flex} ${gap} ${n.wrap ? "flex-wrap" : ""}`}>
      <RenderKids
        kids={n.children as UINode[]}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    </div>
  );
}

function GridRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const colsRaw = String(n.columns ?? 2);
  const gap = resolveGapClass(n);
  // Tailwind JIT needs complete class names, cannot interpolate
  const gridColsMap: Record<string, string> = {
    "1": "grid-cols-1",
    "2": "grid-cols-2",
    "3": "grid-cols-3",
    "4": "grid-cols-4",
    "5": "grid-cols-5",
    "6": "grid-cols-6",
    auto: "grid-cols-[auto]",
  };
  const colsClass = gridColsMap[colsRaw] ?? "grid-cols-2";
  return (
    <div className={`grid ${colsClass} ${gap}`}>
      <RenderKids
        kids={n.children as UINode[]}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    </div>
  );
}

function SplitRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const isHoriz = n.orientation === "horizontal";
  const ratio = String(n.ratio ?? "2:1");
  const [left, right] = ratio.split(":").map(Number);
  return (
    <div className={`flex ${isHoriz ? "flex-row" : "flex-col"} gap-4`}>
      <div style={{ flex: left }}>
        <Renderer
          node={n.primary as UINode}
          localState={localState}
          setLocalValue={setLocalValue}
          onAIEvent={onAIEvent}
        />
      </div>
      <div style={{ flex: right }}>
        <Renderer
          node={n.secondary as UINode}
          localState={localState}
          setLocalValue={setLocalValue}
          onAIEvent={onAIEvent}
        />
      </div>
    </div>
  );
}

function RegionRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const region = String(n.region);
  const gap = resolveGapClass(n);
  const rc: Record<string, string> = {
    header: `border-b border-neutral-800 pb-3 mb-4 flex flex-col ${gap}`,
    sidebar: `border-r border-neutral-800 pr-4 flex flex-col ${gap}`,
    main: `flex-1 flex flex-col ${gap}`,
    inspector: `bg-neutral-900/50 rounded-lg ${resolvePadClass(n)} flex flex-col ${gap}`,
    footer: `border-t border-neutral-800 pt-3 mt-4 flex flex-col ${gap}`,
    toolbar: `flex items-center gap-2 mb-4`,
    results: `bg-neutral-900/30 rounded-lg ${resolvePadClass(n)} mt-4 flex flex-col ${gap}`,
    logs: `bg-neutral-950 rounded-lg p-3 text-xs font-mono flex flex-col ${gap}`,
  };
  return (
    <div className={rc[region] ?? `flex flex-col ${gap}`}>
      <RenderKids
        kids={n.children as UINode[]}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    </div>
  );
}

function ToolbarRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const gap = resolveGapClass(n);
  return (
    <div className={`flex items-center gap-3 flex-wrap ${gap}`}>
      <RenderKids
        kids={n.children as UINode[]}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    </div>
  );
}

function SpacerRender({ n }: RSimple) {
  const sm: Record<string, string> = {
    xs: "h-2",
    sm: "h-4",
    md: "h-8",
    lg: "h-12",
  };
  return <div className={sm[String(n.size ?? "md")]} />;
}

function DividerRender({ n }: RSimple) {
  return n.orientation === "vertical" ? (
    <div className="h-full mx-2 border-l border-neutral-800" />
  ) : (
    <hr className="w-full my-2 border-neutral-800" />
  );
}

// -----------------------------------------------------------
// Composition
// -----------------------------------------------------------

function PanelRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const pad = resolvePadClass(n);
  const gap = resolveGapClass(n);
  return (
    <div
      className={`bg-neutral-900 border border-neutral-800 rounded-xl ${pad} flex flex-col ${gap}`}
    >
      {n.title ? (
        <h3 className="text-lg font-semibold">{String(n.title)}</h3>
      ) : null}
      {n.subtitle ? (
        <p className="text-sm text-neutral-400">{String(n.subtitle)}</p>
      ) : null}
      <RenderKids
        kids={n.children as UINode[]}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    </div>
  );
}

function TabsRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const [activeTab, setActiveTab] = React.useState(String(n.activeTab));
  const tabs =
    (n.tabs as Array<{ id: string; label: string; children: UINode[] }>) ?? [];
  const active = tabs.find((t: { id: string }) => t.id === activeTab);

  const handleTabClick = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      if (
        n.interaction &&
        (n.interaction as { mode: string }).mode === "ai_transition"
      ) {
        import("./event").then(
          ({ createTabChangeEvent, createClientSnapshot }) => {
            onAIEvent(
              createTabChangeEvent(
                String(n.id),
                activeTab,
                tabId,
                createClientSnapshot(localState, null),
              ),
            );
          },
        );
      }
    },
    [n, activeTab, localState, onAIEvent],
  );

  return (
    <div>
      <div className="flex gap-1 border-b border-neutral-800 mb-3">
        {tabs.map((tab: { id: string; label: string }) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab.id === activeTab ? "bg-neutral-800 text-neutral-100 border-b-2 border-blue-500" : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active ? (
        <div className={resolveGapClass(n) || resolveSpaceYClass(n)}>
          <RenderKids
            kids={active.children}
            localState={localState}
            setLocalValue={setLocalValue}
            onAIEvent={onAIEvent}
          />
        </div>
      ) : null}
    </div>
  );
}

function ModalRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const handleClose = useCallback(() => {
    import("./event").then(
      ({ createModalCloseEvent, createClientSnapshot }) => {
        onAIEvent(
          createModalCloseEvent(
            String(n.id),
            String(n.closeIntent),
            createClientSnapshot(localState, null),
          ),
        );
      },
    );
  }, [n, localState, onAIEvent]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{String(n.title)}</h2>
          <button
            onClick={handleClose}
            className="text-neutral-400 hover:text-neutral-200 text-2xl leading-none"
          >
            &times;
          </button>
        </div>
        <RenderKids
          kids={n.children as UINode[]}
          localState={localState}
          setLocalValue={setLocalValue}
          onAIEvent={onAIEvent}
        />
      </div>
    </div>
  );
}

function DrawerRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const sc: Record<string, string> = {
    left: "left-0 top-0 h-full w-80",
    right: "right-0 top-0 h-full w-80",
    bottom: "bottom-0 left-0 w-full h-64",
  };
  return (
    <div
      className={`fixed z-40 bg-neutral-900 border border-neutral-700 p-4 overflow-auto ${sc[String(n.side)]}`}
    >
      <h3 className="text-lg font-bold mb-3">{String(n.title)}</h3>
      <RenderKids
        kids={n.children as UINode[]}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    </div>
  );
}

// -----------------------------------------------------------
// Content
// -----------------------------------------------------------

function HeadingRender({ n }: RSimple) {
  const lvl = (n.level as number) ?? 2;
  const sc: Record<number, string> = {
    1: "text-3xl font-bold",
    2: "text-2xl font-semibold",
    3: "text-xl font-medium",
    4: "text-lg font-medium",
  };
  if (lvl === 1) return <h1 className={sc[1]}>{String(n.text)}</h1>;
  if (lvl === 2) return <h2 className={sc[2]}>{String(n.text)}</h2>;
  if (lvl === 3) return <h3 className={sc[3]}>{String(n.text)}</h3>;
  return <h4 className={sc[4]}>{String(n.text)}</h4>;
}

function TextRender({ n }: RSimple) {
  const tc: Record<string, string> = {
    default: "text-neutral-100",
    muted: "text-neutral-400",
    success: "text-green-400",
    warning: "text-yellow-400",
    danger: "text-red-400",
  };
  const style = (n.style as { tone?: string }) ?? {};
  return <p className={tc[style.tone ?? "default"]}>{String(n.text)}</p>;
}

function TableRender({ n }: RSimple) {
  const cols = n.columns as string[];
  const rows = n.rows as Array<Array<string | number | boolean | null>>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-neutral-700">
            {cols.map((col, i) => (
              <th
                key={i}
                className="text-left p-2 text-neutral-400 font-medium"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-neutral-800 hover:bg-neutral-800/30"
            >
              {row.map((cell, ci) => (
                <td key={ci} className="p-2">
                  {String(cell ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricRender({ n }: RSimple) {
  const cc: Record<string, string> = {
    real: "text-green-400",
    simulated: "text-yellow-400",
    estimated: "text-yellow-500",
  };
  return (
    <div className="bg-neutral-800/50 rounded-lg p-3 text-center">
      <div className="text-2xl font-bold text-neutral-100">
        {String(n.value)}
        {n.unit ? (
          <span className="text-sm text-neutral-400 ml-1">
            {String(n.unit)}
          </span>
        ) : null}
      </div>
      <div className="text-xs text-neutral-400 mt-1">{String(n.label)}</div>
      {n.confidence ? (
        <div className={`text-xs mt-1 ${cc[String(n.confidence)]}`}>
          {String(n.confidence)}
        </div>
      ) : null}
    </div>
  );
}

function AlertRender({ n }: RSimple) {
  const tc: Record<string, string> = {
    info: "bg-blue-950 border-blue-800 text-blue-200",
    success: "bg-green-950 border-green-800 text-green-200",
    warning: "bg-yellow-950 border-yellow-800 text-yellow-200",
    danger: "bg-red-950 border-red-800 text-red-200",
  };
  return (
    <div className={`border rounded-lg p-3 ${tc[String(n.tone)]}`}>
      {n.title ? (
        <div className="font-semibold mb-1">{String(n.title)}</div>
      ) : null}
      <div className="text-sm">{String(n.message)}</div>
    </div>
  );
}

function CodeBlockRender({ n }: RSimple) {
  return (
    <pre className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 overflow-x-auto text-sm font-mono text-neutral-200">
      {n.language ? (
        <div className="text-xs text-neutral-500 mb-1">
          {String(n.language)}
        </div>
      ) : null}
      <code>{String(n.code)}</code>
    </pre>
  );
}

function ChartBarRender({ n }: RSimple) {
  const data = n.data as Array<{ label: string; value: number }>;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bg-neutral-900 rounded-lg p-4">
      {n.title ? (
        <h4 className="text-sm font-medium mb-3 text-neutral-300">
          {String(n.title)}
        </h4>
      ) : null}
      <div className="space-y-2">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-neutral-400 w-24 truncate">
              {item.label}
            </span>
            <div className="flex-1 bg-neutral-800 rounded-full h-5 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full flex items-center justify-end px-2 text-xs text-white"
                style={{ width: `${(item.value / maxVal) * 100}%` }}
              >
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartLineRender({ n }: RSimple) {
  const data = n.data as Array<{ x: string | number; y: number }>;
  const maxY = Math.max(...data.map((d) => d.y), 1);
  return (
    <div className="bg-neutral-900 rounded-lg p-4">
      {n.title ? (
        <h4 className="text-sm font-medium mb-3 text-neutral-300">
          {String(n.title)}
        </h4>
      ) : null}
      <div className="flex items-end gap-1 h-32 mt-2">
        {data.slice(0, 20).map((item, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col items-center"
            title={`x=${item.x}, y=${item.y}`}
          >
            <div className="text-[8px] text-neutral-500 mb-0.5">{item.y}</div>
            <div
              className="bg-blue-600 w-full rounded-t"
              style={{ height: `${(item.y / maxY) * 100}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// Input
// -----------------------------------------------------------

function ButtonRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const vc: Record<string, string> = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white",
    secondary: "bg-neutral-700 hover:bg-neutral-600 text-neutral-200",
    ghost: "bg-transparent hover:bg-neutral-800 text-neutral-300",
    danger: "bg-red-700 hover:bg-red-600 text-white",
  };
  const interaction = n.interaction as
    | {
        mode?: string;
        includeLocalStateOnCommit?: boolean;
        commitOn?: string[];
      }
    | undefined;
  const localAction = n.localAction as
    | {
        type: string;
        binding: string;
        step?: number;
        min?: number;
        max?: number;
        value?: unknown;
      }
    | undefined;

  const handleClick = useCallback(() => {
    const isAI = interaction?.mode === "ai_transition" || !interaction;
    if (localAction && interaction?.mode === "local") {
      const binding = localAction.binding;
      const current = Number(resolveBindingValue(localState, binding, 0));
      let next: unknown;
      if (localAction.type === "increment")
        next = Math.min(
          localAction.max ?? Infinity,
          current + (localAction.step ?? 1),
        );
      else if (localAction.type === "decrement")
        next = Math.max(
          localAction.min ?? -Infinity,
          current - (localAction.step ?? 1),
        );
      else if (localAction.type === "set_value") next = localAction.value;
      else if (localAction.type === "toggle")
        next = !resolveBindingValue(localState, binding, false);
      else next = current;
      setLocalValue(binding, next);
    } else if (isAI) {
      import("./event").then(
        ({ createComponentClickEvent, createClientSnapshot }) => {
          const snapshot = interaction?.includeLocalStateOnCommit
            ? createClientSnapshot(localState, null)
            : undefined;
          onAIEvent(
            createComponentClickEvent(
              {
                id: String(n.id),
                type: "button",
                label: String(n.label),
                intent: String(n.intent),
                semanticRole: n.semanticRole as "analysis_action" | undefined,
                expectedEffect: n.expectedEffect as string | undefined,
                interaction: n.interaction as
                  | {
                      mode: "local" | "ai_transition" | "hybrid";
                      commitOn?: Array<
                        "blur" | "enter" | "change" | "click" | "submit"
                      >;
                      includeLocalStateOnCommit?: boolean;
                      debounceMs?: number;
                    }
                  | undefined,
              },
              snapshot,
            ),
          );
        },
      );
    }
  }, [n, localState, setLocalValue, onAIEvent, interaction, localAction]);

  return (
    <button
      onClick={handleClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${vc[String(n.variant ?? "primary")]}`}
    >
      {String(n.label)}
    </button>
  );
}

function TextInputRender({ n, localState, setLocalValue }: RProps) {
  const binding = String(n.binding);
  const value = String(resolveBindingValue(localState, binding, n.value ?? ""));
  return (
    <div className="flex flex-col gap-1">
      {n.label ? (
        <label className="text-xs text-neutral-400">{String(n.label)}</label>
      ) : null}
      <input
        type="text"
        value={value}
        onChange={(e) => setLocalValue(binding, e.target.value)}
        placeholder={String(n.placeholder ?? "")}
        className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

function NumberInputRender({ n, localState, setLocalValue }: RProps) {
  const binding = String(n.binding);
  const value = Number(resolveBindingValue(localState, binding, n.value ?? 0));
  return (
    <div className="flex flex-col gap-1">
      {n.label ? (
        <label className="text-xs text-neutral-400">{String(n.label)}</label>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) =>
            setLocalValue(binding, parseFloat(e.target.value) || 0)
          }
          min={n.min as number}
          max={n.max as number}
          step={n.step as number}
          className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 w-full focus:outline-none focus:border-blue-500"
        />
        {n.unit ? (
          <span className="text-xs text-neutral-400">{String(n.unit)}</span>
        ) : null}
      </div>
    </div>
  );
}

function TextareaRender({ n, localState, setLocalValue }: RLocal) {
  const binding = String(n.binding);
  const value = String(resolveBindingValue(localState, binding, n.value ?? ""));
  return (
    <div className="flex flex-col gap-1">
      {n.label ? (
        <label className="text-xs text-neutral-400">{String(n.label)}</label>
      ) : null}
      <textarea
        value={value}
        onChange={(e) => setLocalValue(binding, e.target.value)}
        className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 min-h-[80px] focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

function SelectRender({ n, localState, setLocalValue }: RLocal) {
  const binding = String(n.binding);
  const value = String(resolveBindingValue(localState, binding, n.value ?? ""));
  const options = n.options as Array<{ label: string; value: string }>;
  return (
    <div className="flex flex-col gap-1">
      {n.label ? (
        <label className="text-xs text-neutral-400">{String(n.label)}</label>
      ) : null}
      <select
        value={value}
        onChange={(e) => setLocalValue(binding, e.target.value)}
        className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-blue-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckboxRender({ n, localState, setLocalValue }: RLocal) {
  const binding = String(n.binding);
  const checked = Boolean(resolveBindingValue(localState, binding, n.checked));
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setLocalValue(binding, e.target.checked)}
        className="rounded bg-neutral-800 border-neutral-700 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-neutral-300">{String(n.label)}</span>
    </label>
  );
}

function SliderRender({ n, localState, setLocalValue }: RLocal) {
  const binding = String(n.binding);
  const raw = resolveBindingValue(localState, binding, n.value);
  const val = raw == null ? Number(n.value) : Number(raw);
  const safe = isNaN(val) ? Number(n.value) : val;
  return (
    <div className="flex flex-col gap-1">
      {n.label ? (
        <div className="flex justify-between">
          <label className="text-xs text-neutral-400">{String(n.label)}</label>
          <span className="text-xs text-neutral-300">
            {safe}
            {n.unit ? ` ${n.unit}` : ""}
          </span>
        </div>
      ) : null}
      <input
        type="range"
        value={safe}
        min={Number(n.min)}
        max={Number(n.max)}
        step={Number(n.step ?? 1)}
        onChange={(e) => setLocalValue(binding, parseFloat(e.target.value))}
        className="w-full accent-blue-600"
      />
      <div className="flex justify-between text-[10px] text-neutral-600">
        <span>
          {String(n.min)}
          {n.unit ? ` ${n.unit}` : ""}
        </span>
        <span>
          {String(n.max)}
          {n.unit ? ` ${n.unit}` : ""}
        </span>
      </div>
    </div>
  );
}

function StepperRender({ n, localState, setLocalValue }: RLocal) {
  const binding = String(n.binding);
  const raw = resolveBindingValue(localState, binding, n.value);
  const val = raw == null ? Number(n.value) : Number(raw);
  const safe = isNaN(val) ? Number(n.value) : val;
  const step = Number(n.step ?? 1);
  const inc = useCallback(() => {
    const nxt = Math.min(Number(n.max ?? Infinity), safe + step);
    setLocalValue(binding, nxt);
  }, [n, safe, step, setLocalValue, binding]);
  const dec = useCallback(() => {
    const nxt = Math.max(Number(n.min ?? -Infinity), safe - step);
    setLocalValue(binding, nxt);
  }, [n, safe, step, setLocalValue, binding]);
  return (
    <div className="flex flex-col gap-1">
      {n.label ? (
        <label className="text-xs text-neutral-400">{String(n.label)}</label>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          onClick={dec}
          className="w-8 h-8 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 flex items-center justify-center text-lg"
        >
          −
        </button>
        <span className="text-sm text-neutral-100 min-w-[60px] text-center font-mono">
          {safe}
          {n.unit ? ` ${n.unit}` : ""}
        </span>
        <button
          onClick={inc}
          className="w-8 h-8 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 flex items-center justify-center text-lg"
        >
          +
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// Runtime
// -----------------------------------------------------------

function LocalValueDisplayRender({ n, localState }: RLocalView) {
  const binding = String(n.binding);
  const raw = resolveBindingValue(localState, binding, null);
  let dv = "—";
  if (raw != null) {
    if (typeof raw === "number") {
      const fmt = String(n.format ?? "plain");
      if (fmt === "fixed_1") dv = raw.toFixed(1);
      else if (fmt === "fixed_2") dv = raw.toFixed(2);
      else if (fmt === "scientific") dv = raw.toExponential(2);
      else dv = String(raw);
    } else dv = String(raw);
  }
  return (
    <div className="flex justify-between items-center py-1 text-sm">
      {n.label ? (
        <span className="text-neutral-400">{String(n.label)}</span>
      ) : null}
      <span className="text-neutral-100 font-mono">
        {dv}
        {n.unit ? ` ${n.unit}` : ""}
      </span>
    </div>
  );
}
