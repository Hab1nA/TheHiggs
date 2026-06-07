// ============================================================
// AUIR Renderer — 将 AUIR State 渲染为 React UI
// ============================================================

"use client";

import type { AUIREvent, LocalUIState, UINode } from "@/auir/types";
import React, { useCallback, useEffect } from "react";
import { resolveBindingValue } from "./bindings";

// -----------------------------------------------------------
// Current UI Context — 为事件创建提供当前 UI 树
// -----------------------------------------------------------

const CurrentUIContext = React.createContext<UINode | null>(null);

/** 在 Renderer 树内部获取当前 UI 节点 */
function useCurrentUI(): UINode | null {
  return React.useContext(CurrentUIContext);
}

// -----------------------------------------------------------
// App Context — 为 TimerRefreshRender 等需要 app 信息的组件提供上下文
// -----------------------------------------------------------

type AppContextValue = {
  appId?: string;
  appTitle?: string;
  appKind?: string;
};

const AppContext = React.createContext<AppContextValue>({});

/** 用于在 Renderer 树中提供 app 上下文（由 page.tsx 设置） */
export function AppContextProvider({
  appId,
  appTitle,
  appKind,
  children,
}: AppContextValue & { children: React.ReactNode }) {
  const value = React.useMemo(
    () => ({ appId, appTitle, appKind }),
    [appId, appTitle, appKind],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** 在 Renderer 树内部消费 app 上下文 */
export function useAppContext(): AppContextValue {
  return React.useContext(AppContext);
}

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

export type ComponentInteractionMeta = {
  componentId: string;
  componentType: string;
  label?: string;
  interactionMode?: string;
};

export type RendererProps = {
  node: UINode;
  localState: LocalUIState;
  setLocalValue: (
    binding: string,
    value: unknown,
    meta?: ComponentInteractionMeta,
  ) => void;
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

  return (
    <CurrentUIContext.Provider value={node}>
      {renderNode(t, n, node, localState, setLocalValue, onAIEvent)}
    </CurrentUIContext.Provider>
  );
}

function renderNode(
  t: string,
  n: Record<string, unknown>,
  node: UINode,
  localState: LocalUIState,
  setLocalValue: (b: string, v: unknown, m?: ComponentInteractionMeta) => void,
  onAIEvent: (e: AUIREvent) => void,
) {
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
  if (t === "image") return <ImageRender n={n} />;
  if (t === "table") return <TableRender n={n} />;
  if (t === "metric") return <MetricRender n={n} />;
  if (t === "alert") return <AlertRender n={n} />;
  if (t === "code_block") return <CodeBlockRender n={n} />;
  if (t === "chart_bar") return <ChartBarRender n={n} />;
  if (t === "chart_line") return <ChartLineRender n={n} />;
  if (t === "carousel")
    return (
      <CarouselRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "badge") return <BadgeRender n={n} />;
  if (t === "progress") return <ProgressRender n={n} />;
  if (t === "statistic") return <StatisticRender n={n} />;
  if (t === "timeline") return <TimelineRender n={n} />;
  if (t === "accordion")
    return (
      <AccordionRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "breadcrumb") return <BreadcrumbRender n={n} />;
  if (t === "tag") return <TagRender n={n} />;
  if (t === "list") return <ListRender n={n} />;
  if (t === "quote") return <QuoteRender n={n} />;
  if (t === "card")
    return (
      <CardRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "description_list") return <DescriptionListRender n={n} />;
  if (t === "empty_state")
    return (
      <EmptyStateRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "gauge") return <GaugeRender n={n} />;
  if (t === "kpi_card") return <KPICardRender n={n} />;
  if (t === "heatmap") return <HeatmapRender n={n} />;
  if (t === "color_swatch") return <ColorSwatchRender n={n} />;
  if (t === "radar_chart") return <RadarChartRender n={n} />;
  if (t === "stat_group") return <StatGroupRender n={n} />;
  if (t === "steps") return <StepsRender n={n} />;
  if (t === "button")
    return (
      <ButtonRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "external_link") return <ExternalLinkRender n={n} />;
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
        onAIEvent={onAIEvent}
      />
    );
  if (t === "select")
    return (
      <SelectRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "checkbox")
    return (
      <CheckboxRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "slider")
    return (
      <SliderRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "stepper")
    return (
      <StepperRender
        n={n}
        localState={localState}
        setLocalValue={setLocalValue}
        onAIEvent={onAIEvent}
      />
    );
  if (t === "local_value_display")
    return <LocalValueDisplayRender n={n} localState={localState} />;
  if (t === "clock") return <ClockRender n={n} />;
  if (t === "timer_refresh")
    return <TimerRefreshRender n={n} onAIEvent={onAIEvent} />;

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
  setLocalValue: (b: string, v: unknown, m?: ComponentInteractionMeta) => void;
  onAIEvent: (e: AUIREvent) => void;
}) {
  if (!kids || !Array.isArray(kids)) return null;
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
  setLocalValue: (b: string, v: unknown, m?: ComponentInteractionMeta) => void;
  onAIEvent: (e: AUIREvent) => void;
};
type RSimple = { n: Record<string, unknown> };
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
  const currentUI = useCurrentUI();
  const [activeTab, setActiveTab] = React.useState(String(n.activeTab));
  const tabs =
    (n.tabs as Array<{ id: string; label: string; children: UINode[] }>) ?? [];
  const active = tabs.find((t: { id: string }) => t.id === activeTab);

  // Sync local state when AI changes activeTab prop
  useEffect(() => {
    setActiveTab(String(n.activeTab));
  }, [n.activeTab]);

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
                createClientSnapshot(localState, currentUI ?? null),
              ),
            );
          },
        );
      }
    },
    [n, activeTab, localState, currentUI, onAIEvent],
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
  const currentUI = useCurrentUI();
  const handleClose = useCallback(() => {
    import("./event").then(
      ({ createModalCloseEvent, createClientSnapshot }) => {
        onAIEvent(
          createModalCloseEvent(
            String(n.id),
            String(n.closeIntent),
            createClientSnapshot(localState, currentUI ?? null),
          ),
        );
      },
    );
  }, [n, localState, currentUI, onAIEvent]);
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

function ClockRender({ n }: RSimple) {
  const [now, setNow] = React.useState(() => new Date());
  const interval = Number(n.interval ?? 1000);

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(id);
  }, [interval]);

  const format = String(n.format ?? "time");
  const tz = n.timezone ? String(n.timezone) : undefined;
  const variant = String(n.variant ?? "default");

  let display: string;
  if (format === "iso") {
    display = now.toISOString();
  } else {
    const opts: Intl.DateTimeFormatOptions =
      format === "time"
        ? {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZone: tz,
          }
        : format === "date"
          ? { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }
          : {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              timeZone: tz,
            };
    display = now.toLocaleString(undefined, opts);
  }

  const variantClasses: Record<string, string> = {
    default: "text-lg font-mono tabular-nums text-neutral-100",
    mono: "text-lg font-mono tabular-nums tracking-widest text-green-400",
    large: "text-3xl font-bold font-mono tabular-nums text-neutral-100",
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {n.label ? (
        <span className="text-xs text-neutral-400">{String(n.label)}</span>
      ) : null}
      <span className={variantClasses[variant] ?? variantClasses.default}>
        {display}
      </span>
    </div>
  );
}

// -----------------------------------------------------------
// Timer Refresh — 计时触发刷新器
// -----------------------------------------------------------

function TimerRefreshRender({
  n,
  onAIEvent,
}: {
  n: Record<string, unknown>;
  onAIEvent: (e: AUIREvent) => void;
}) {
  const appCtx = useAppContext();
  const seconds = Number(n.seconds ?? 3);
  const message = n.message ? String(n.message) : "AI 正在处理...";
  const showProgress = Boolean(n.showProgress ?? true);
  const [remaining, setRemaining] = React.useState(seconds);
  const [fired, setFired] = React.useState(false);

  React.useEffect(() => {
    if (fired) return;
    if (remaining <= 0) {
      setFired(true);
      // Dynamically import to avoid circular dependency
      import("./event").then(({ createTimerRefreshEvent }) => {
        onAIEvent(
          createTimerRefreshEvent(String(n.id), {
            appId: appCtx.appId,
            appTitle: appCtx.appTitle,
            appKind: appCtx.appKind,
          }),
        );
      });
      return;
    }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [
    remaining,
    fired,
    n.id,
    onAIEvent,
    appCtx.appId,
    appCtx.appTitle,
    appCtx.appKind,
  ]);

  const pct = Math.round(((seconds - remaining) / Math.max(seconds, 1)) * 100);
  const tone = fired ? "success" : "primary";

  return (
    <div className="flex flex-col items-center gap-3 py-6">
      {/* Spinner + message */}
      <div className="flex items-center gap-3">
        {fired ? (
          <svg
            className="w-5 h-5 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 text-blue-400 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        <span className="text-sm text-neutral-300">
          {fired ? "正在刷新..." : message}
        </span>
      </div>

      {/* Countdown badge */}
      {!fired && (
        <span className="text-xs text-neutral-500 font-mono tabular-nums">
          {remaining}s 后自动刷新
        </span>
      )}

      {/* Progress bar */}
      {showProgress && (
        <div className="w-64 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-linear ${
              tone === "success" ? "bg-green-500" : "bg-blue-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
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
  const currentUI = useCurrentUI();
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
          const includeSnapshot =
            interaction?.includeLocalStateOnCommit !== false;
          const snapshot = includeSnapshot
            ? createClientSnapshot(localState, currentUI ?? null)
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
  }, [
    n,
    localState,
    setLocalValue,
    onAIEvent,
    interaction,
    localAction,
    currentUI,
  ]);

  return (
    <button
      onClick={handleClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${vc[String(n.variant ?? "primary")]}`}
    >
      {String(n.label)}
    </button>
  );
}

function ExternalLinkRender({ n }: RSimple) {
  const vc: Record<string, string> = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white",
    secondary: "bg-neutral-700 hover:bg-neutral-600 text-neutral-200",
    ghost: "bg-transparent hover:bg-neutral-800 text-neutral-300",
    danger: "bg-red-700 hover:bg-red-600 text-white",
  };
  const url = String(n.url ?? "");
  // Security: block javascript: protocol
  if (url.toLowerCase().startsWith("javascript:")) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${vc[String(n.variant ?? "primary")]}`}
    >
      {String(n.label)}
      <span className="text-xs opacity-70">↗</span>
    </a>
  );
}

function TextInputRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const currentUI = useCurrentUI();
  const binding = String(n.binding);
  const value = String(resolveBindingValue(localState, binding, n.value ?? ""));
  const interaction = n.interaction as
    | { mode?: string; commitOn?: string[] }
    | undefined;

  const fireCommit = useCallback(
    (trigger: string) => {
      if (
        interaction?.mode === "ai_transition" &&
        interaction.commitOn?.includes(trigger)
      ) {
        import("./event").then(
          ({ createComponentCommitEvent, createClientSnapshot }) => {
            onAIEvent(
              createComponentCommitEvent(
                String(n.id),
                "text_input",
                binding,
                n.value ?? "",
                value,
                createClientSnapshot(localState, currentUI ?? null),
              ),
            );
          },
        );
      }
    },
    [n, binding, value, localState, currentUI, onAIEvent, interaction],
  );

  return (
    <div className="flex flex-col gap-1">
      {n.label ? (
        <label className="text-xs text-neutral-400">{String(n.label)}</label>
      ) : null}
      <input
        type="text"
        value={value}
        onChange={(e) =>
          setLocalValue(binding, e.target.value, {
            componentId: String(n.id),
            componentType: "text_input",
            label: n.label ? String(n.label) : undefined,
            interactionMode: interaction?.mode,
          })
        }
        onBlur={() => fireCommit("blur")}
        onKeyDown={(e) => {
          if (e.key === "Enter") fireCommit("enter");
        }}
        placeholder={String(n.placeholder ?? "")}
        className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

function NumberInputRender({
  n,
  localState,
  setLocalValue,
  onAIEvent,
}: RProps) {
  const currentUI = useCurrentUI();
  const binding = String(n.binding);
  const value = Number(resolveBindingValue(localState, binding, n.value ?? 0));
  const interaction = n.interaction as
    | { mode?: string; commitOn?: string[] }
    | undefined;

  const fireCommit = useCallback(
    (trigger: string) => {
      if (
        interaction?.mode === "ai_transition" &&
        interaction.commitOn?.includes(trigger)
      ) {
        import("./event").then(
          ({ createComponentCommitEvent, createClientSnapshot }) => {
            onAIEvent(
              createComponentCommitEvent(
                String(n.id),
                "number_input",
                binding,
                n.value ?? 0,
                value,
                createClientSnapshot(localState, currentUI ?? null),
              ),
            );
          },
        );
      }
    },
    [n, binding, value, localState, currentUI, onAIEvent, interaction],
  );

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
            setLocalValue(binding, parseFloat(e.target.value) || 0, {
              componentId: String(n.id),
              componentType: "number_input",
              label: n.label ? String(n.label) : undefined,
              interactionMode: interaction?.mode,
            })
          }
          onBlur={() => fireCommit("blur")}
          onKeyDown={(e) => {
            if (e.key === "Enter") fireCommit("enter");
          }}
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

function TextareaRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const currentUI = useCurrentUI();
  const binding = String(n.binding);
  const value = String(resolveBindingValue(localState, binding, n.value ?? ""));
  const interaction = n.interaction as
    | { mode?: string; commitOn?: string[] }
    | undefined;

  const fireCommit = useCallback(
    (trigger: string) => {
      if (
        interaction?.mode === "ai_transition" &&
        interaction.commitOn?.includes(trigger)
      ) {
        import("./event").then(
          ({ createComponentCommitEvent, createClientSnapshot }) => {
            onAIEvent(
              createComponentCommitEvent(
                String(n.id),
                "textarea",
                binding,
                n.value ?? "",
                value,
                createClientSnapshot(localState, currentUI ?? null),
              ),
            );
          },
        );
      }
    },
    [n, binding, value, localState, currentUI, onAIEvent, interaction],
  );

  return (
    <div className="flex flex-col gap-1">
      {n.label ? (
        <label className="text-xs text-neutral-400">{String(n.label)}</label>
      ) : null}
      <textarea
        value={value}
        onChange={(e) =>
          setLocalValue(binding, e.target.value, {
            componentId: String(n.id),
            componentType: "textarea",
            label: n.label ? String(n.label) : undefined,
            interactionMode: interaction?.mode,
          })
        }
        onBlur={() => fireCommit("blur")}
        className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 min-h-[80px] focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

function SelectRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const currentUI = useCurrentUI();
  const binding = String(n.binding);
  const value = String(resolveBindingValue(localState, binding, n.value ?? ""));
  const options = n.options as Array<{ label: string; value: string }>;
  const interaction = n.interaction as
    | { mode?: string; commitOn?: string[] }
    | undefined;

  const fireCommit = useCallback(
    (trigger: string, nextValue: string) => {
      if (
        interaction?.mode === "ai_transition" &&
        interaction.commitOn?.includes(trigger)
      ) {
        import("./event").then(
          ({ createComponentCommitEvent, createClientSnapshot }) => {
            onAIEvent(
              createComponentCommitEvent(
                String(n.id),
                "select",
                binding,
                value,
                nextValue,
                createClientSnapshot(localState, currentUI ?? null),
              ),
            );
          },
        );
      }
    },
    [n, binding, value, localState, currentUI, onAIEvent, interaction],
  );

  return (
    <div className="flex flex-col gap-1">
      {n.label ? (
        <label className="text-xs text-neutral-400">{String(n.label)}</label>
      ) : null}
      <select
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setLocalValue(binding, next, {
            componentId: String(n.id),
            componentType: "select",
            label: n.label ? String(n.label) : undefined,
            interactionMode: interaction?.mode,
          });
          fireCommit("change", next);
        }}
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

function CheckboxRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const currentUI = useCurrentUI();
  const binding = String(n.binding);
  const checked = Boolean(resolveBindingValue(localState, binding, n.checked));
  const interaction = n.interaction as
    | { mode?: string; commitOn?: string[] }
    | undefined;

  const fireCommit = useCallback(
    (trigger: string, nextValue: boolean) => {
      if (
        interaction?.mode === "ai_transition" &&
        interaction.commitOn?.includes(trigger)
      ) {
        import("./event").then(
          ({ createComponentCommitEvent, createClientSnapshot }) => {
            onAIEvent(
              createComponentCommitEvent(
                String(n.id),
                "checkbox",
                binding,
                checked,
                nextValue,
                createClientSnapshot(localState, currentUI ?? null),
              ),
            );
          },
        );
      }
    },
    [n, binding, checked, localState, currentUI, onAIEvent, interaction],
  );

  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          const next = e.target.checked;
          setLocalValue(binding, next, {
            componentId: String(n.id),
            componentType: "checkbox",
            label: n.label ? String(n.label) : undefined,
            interactionMode: interaction?.mode,
          });
          fireCommit("change", next);
        }}
        className="rounded bg-neutral-800 border-neutral-700 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-neutral-300">{String(n.label)}</span>
    </label>
  );
}

function SliderRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const currentUI = useCurrentUI();
  const binding = String(n.binding);
  const raw = resolveBindingValue(localState, binding, n.value);
  const val = raw == null ? Number(n.value) : Number(raw);
  const safe = isNaN(val) ? Number(n.value) : val;
  const interaction = n.interaction as
    | { mode?: string; commitOn?: string[] }
    | undefined;

  const fireCommit = useCallback(
    (trigger: string, nextValue: number) => {
      if (
        interaction?.mode === "ai_transition" &&
        interaction.commitOn?.includes(trigger)
      ) {
        import("./event").then(
          ({ createComponentCommitEvent, createClientSnapshot }) => {
            onAIEvent(
              createComponentCommitEvent(
                String(n.id),
                "slider",
                binding,
                val,
                nextValue,
                createClientSnapshot(localState, currentUI ?? null),
              ),
            );
          },
        );
      }
    },
    [n, binding, val, localState, currentUI, onAIEvent, interaction],
  );

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
        onChange={(e) => {
          const next = parseFloat(e.target.value);
          setLocalValue(binding, next, {
            componentId: String(n.id),
            componentType: "slider",
            label: n.label ? String(n.label) : undefined,
            interactionMode: interaction?.mode,
          });
          fireCommit("change", next);
        }}
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

function StepperRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const currentUI = useCurrentUI();
  const binding = String(n.binding);
  const raw = resolveBindingValue(localState, binding, n.value);
  const val = raw == null ? Number(n.value) : Number(raw);
  const safe = isNaN(val) ? Number(n.value) : val;
  const step = Number(n.step ?? 1);
  const interaction = n.interaction as
    | { mode?: string; commitOn?: string[] }
    | undefined;

  const fireCommit = useCallback(
    (nextValue: number) => {
      if (
        interaction?.mode === "ai_transition" &&
        interaction.commitOn?.includes("change")
      ) {
        import("./event").then(
          ({ createComponentCommitEvent, createClientSnapshot }) => {
            onAIEvent(
              createComponentCommitEvent(
                String(n.id),
                "stepper",
                binding,
                safe,
                nextValue,
                createClientSnapshot(localState, currentUI ?? null),
              ),
            );
          },
        );
      }
    },
    [n, binding, safe, localState, currentUI, onAIEvent, interaction],
  );

  const inc = useCallback(() => {
    const nxt = Math.min(Number(n.max ?? Infinity), safe + step);
    setLocalValue(binding, nxt, {
      componentId: String(n.id),
      componentType: "stepper",
      label: n.label ? String(n.label) : undefined,
      interactionMode: interaction?.mode,
    });
    fireCommit(nxt);
  }, [n, safe, step, setLocalValue, binding, fireCommit]);
  const dec = useCallback(() => {
    const nxt = Math.max(Number(n.min ?? -Infinity), safe - step);
    setLocalValue(binding, nxt, {
      componentId: String(n.id),
      componentType: "stepper",
      label: n.label ? String(n.label) : undefined,
      interactionMode: interaction?.mode,
    });
    fireCommit(nxt);
  }, [n, safe, step, setLocalValue, binding, fireCommit]);
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

// -----------------------------------------------------------
// v0.3.1 — Extended Nodes
// -----------------------------------------------------------

function CarouselRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const gap = resolveGapClass(n);
  const visible = Number(n.visibleItems ?? 2);
  const widthMap: Record<number, string> = {
    1: "w-full",
    2: "w-1/2",
    3: "w-1/3",
    4: "w-1/4",
  };
  return (
    <div className="flex flex-col gap-2">
      {n.title ? (
        <h4 className="text-sm font-medium text-neutral-300">
          {String(n.title)}
        </h4>
      ) : null}
      <div className={`flex overflow-x-auto ${gap} pb-2 snap-x snap-mandatory`}>
        {(n.children as UINode[]).map((child) => (
          <div
            key={child.id}
            className={`${widthMap[visible] ?? "w-1/2"} flex-shrink-0 snap-start`}
          >
            <Renderer
              node={child}
              localState={localState}
              setLocalValue={setLocalValue}
              onAIEvent={onAIEvent}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function BadgeRender({ n }: RSimple) {
  const variant = String(n.variant ?? "default");
  const size = String(n.size ?? "md");
  const vc: Record<string, string> = {
    default: "bg-neutral-700 text-neutral-300",
    primary: "bg-blue-900/60 text-blue-300 border-blue-700",
    success: "bg-green-900/60 text-green-300 border-green-700",
    warning: "bg-yellow-900/60 text-yellow-300 border-yellow-700",
    danger: "bg-red-900/60 text-red-300 border-red-700",
    info: "bg-cyan-900/60 text-cyan-300 border-cyan-700",
  };
  const sc: Record<string, string> = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2 py-0.5 text-xs",
    lg: "px-2.5 py-1 text-sm",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border border-neutral-700 font-medium ${vc[variant] ?? vc.default} ${sc[size] ?? sc.md}`}
    >
      {String(n.text)}
    </span>
  );
}

function ProgressRender({ n }: RSimple) {
  const value = Number(n.value);
  const max = Number(n.max ?? 100);
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const tone = String(n.tone ?? "primary");
  const tc: Record<string, string> = {
    default: "bg-neutral-500",
    primary: "bg-blue-600",
    success: "bg-green-600",
    warning: "bg-yellow-600",
    danger: "bg-red-600",
  };
  return (
    <div className="flex flex-col gap-1">
      {n.label ? (
        <div className="flex justify-between text-xs">
          <span className="text-neutral-400">{String(n.label)}</span>
          <span className="text-neutral-300">
            {value}
            {n.unit ? ` ${String(n.unit)}` : ""} / {max}
            {n.unit ? ` ${String(n.unit)}` : ""}
          </span>
        </div>
      ) : null}
      <div className="w-full bg-neutral-800 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tc[tone] ?? tc.primary}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatisticRender({ n }: RSimple) {
  const trend = n.trend as string | undefined;
  const tc: Record<string, { color: string; arrow: string }> = {
    up: { color: "text-green-400", arrow: "↑" },
    down: { color: "text-red-400", arrow: "↓" },
    stable: { color: "text-neutral-400", arrow: "→" },
  };
  const t = trend ? tc[trend] : undefined;
  return (
    <div className="bg-neutral-800/50 rounded-lg p-4 flex flex-col gap-1">
      <div className="text-xs text-neutral-400">{String(n.title)}</div>
      <div className="flex items-baseline gap-1.5">
        {n.prefix ? (
          <span className="text-sm text-neutral-500">{String(n.prefix)}</span>
        ) : null}
        <span className="text-2xl font-bold text-neutral-100">
          {String(n.value)}
        </span>
        {n.suffix ? (
          <span className="text-sm text-neutral-400">{String(n.suffix)}</span>
        ) : null}
      </div>
      {t ? (
        <div className={`flex items-center gap-1 text-xs ${t.color}`}>
          <span>{t.arrow}</span>
          {n.trendValue ? <span>{String(n.trendValue)}</span> : null}
        </div>
      ) : null}
      {n.description ? (
        <div className="text-xs text-neutral-500 mt-1">
          {String(n.description)}
        </div>
      ) : null}
    </div>
  );
}

function TimelineRender({ n }: RSimple) {
  const items = n.items as Array<{
    id: string;
    title: string;
    description?: string;
    timestamp?: string;
    tone?: string;
    icon?: string;
  }>;
  const dc: Record<string, string> = {
    default: "bg-neutral-600",
    primary: "bg-blue-600",
    success: "bg-green-600",
    warning: "bg-yellow-600",
    danger: "bg-red-600",
  };
  return (
    <div className="relative pl-6 space-y-4">
      <div className="absolute left-2 top-0 bottom-0 w-px bg-neutral-700" />
      {items.map((item) => (
        <div key={item.id} className="relative">
          <div
            className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full border-2 border-neutral-900 ${dc[item.tone ?? "default"] ?? dc.default}`}
          >
            {item.icon ? (
              <span className="absolute inset-0 flex items-center justify-center text-[6px] text-white">
                {item.icon}
              </span>
            ) : null}
          </div>
          {item.timestamp ? (
            <div className="text-[10px] text-neutral-500 mb-0.5">
              {item.timestamp}
            </div>
          ) : null}
          <div className="text-sm font-medium text-neutral-200">
            {item.title}
          </div>
          {item.description ? (
            <div className="text-xs text-neutral-400 mt-0.5">
              {item.description}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function AccordionRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const items = n.items as Array<{
    id: string;
    title: string;
    children: UINode[];
  }>;
  const defaultIdx = Number(n.defaultOpenIndex ?? -1);
  const [openIdx, setOpenIdx] = React.useState(defaultIdx);
  return (
    <div className="flex flex-col gap-px bg-neutral-800 rounded-lg overflow-hidden">
      {items.map((item, i) => (
        <div key={item.id} className="bg-neutral-900">
          <button
            onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
            className="w-full flex justify-between items-center px-4 py-3 text-sm font-medium text-neutral-200 hover:bg-neutral-800/50 transition-colors"
          >
            <span>{item.title}</span>
            <span
              className={`text-neutral-400 transition-transform text-lg ${openIdx === i ? "rotate-180" : ""}`}
            >
              ▼
            </span>
          </button>
          {openIdx === i ? (
            <div
              className={`px-4 pb-3 ${resolveGapClass(n) ?? "gap-2"} flex flex-col`}
            >
              <RenderKids
                kids={item.children}
                localState={localState}
                setLocalValue={setLocalValue}
                onAIEvent={onAIEvent}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function BreadcrumbRender({ n }: RSimple) {
  const items = n.items as Array<{ label: string; href?: string }>;
  const sep = String(n.separator ?? "/");
  return (
    <nav className="flex items-center gap-1.5 text-sm flex-wrap">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 ? <span className="text-neutral-600">{sep}</span> : null}
          {item.href ? (
            <a
              href={item.href}
              className="text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              {item.label}
            </a>
          ) : (
            <span
              className={
                i === items.length - 1
                  ? "text-neutral-100 font-medium"
                  : "text-neutral-400"
              }
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

function TagRender({ n }: RSimple) {
  const variant = String(n.variant ?? "default");
  const size = String(n.size ?? "md");
  const vc: Record<string, string> = {
    default: "bg-neutral-800 text-neutral-300 border-neutral-700",
    primary: "bg-blue-950/50 text-blue-300 border-blue-800",
    success: "bg-green-950/50 text-green-300 border-green-800",
    warning: "bg-yellow-950/50 text-yellow-300 border-yellow-800",
    danger: "bg-red-950/50 text-red-300 border-red-800",
    info: "bg-cyan-950/50 text-cyan-300 border-cyan-800",
  };
  const sc =
    size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-medium ${vc[variant] ?? vc.default} ${sc}`}
    >
      {String(n.text)}
      {n.removable ? (
        <span className="cursor-pointer text-neutral-500 hover:text-neutral-300 ml-0.5">
          ×
        </span>
      ) : null}
    </span>
  );
}

function ListRender({ n }: RSimple) {
  const items = n.items as Array<{
    id: string;
    text: string;
    description?: string;
    icon?: string;
    tone?: string;
  }>;
  const isOrdered = n.ordered === true;
  const gap = resolveGapClass(n) || resolveSpaceYClass(n);
  const tc: Record<string, string> = {
    default: "text-neutral-100",
    muted: "text-neutral-400",
    primary: "text-blue-300",
    success: "text-green-300",
    warning: "text-yellow-300",
    danger: "text-red-300",
  };
  const Container = isOrdered ? "ol" : "ul";
  return (
    <Container
      className={`${isOrdered ? "list-decimal" : "list-none"} pl-5 ${gap}`}
    >
      {items.map((item) => (
        <li
          key={item.id}
          className={
            isOrdered ? "text-neutral-300 pl-1" : "flex items-start gap-2"
          }
        >
          {!isOrdered && item.icon ? (
            <span className="text-neutral-500 mt-0.5 flex-shrink-0">
              {item.icon}
            </span>
          ) : !isOrdered ? (
            <span className="text-neutral-600 mt-0.5 flex-shrink-0">•</span>
          ) : null}
          <div className="flex flex-col">
            <span
              className={`text-sm ${tc[item.tone ?? "default"] ?? tc.default}`}
            >
              {item.text}
            </span>
            {item.description ? (
              <span className="text-xs text-neutral-500 mt-0.5">
                {item.description}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </Container>
  );
}

function QuoteRender({ n }: RSimple) {
  const tone = String(n.tone ?? "default");
  const bc: Record<string, string> = {
    default: "border-neutral-600 text-neutral-300",
    muted: "border-neutral-800 text-neutral-500",
    primary: "border-blue-600 text-blue-100",
  };
  return (
    <blockquote
      className={`border-l-4 pl-4 py-1 italic ${bc[tone] ?? bc.default}`}
    >
      <p className="text-sm">{String(n.text)}</p>
      {n.author ? (
        <footer className="text-xs mt-1.5 not-italic text-neutral-500">
          — {String(n.author)}
          {n.source ? <span className="ml-1">({String(n.source)})</span> : null}
        </footer>
      ) : null}
    </blockquote>
  );
}

function CardRender({ n, localState, setLocalValue, onAIEvent }: RProps) {
  const gap = resolveGapClass(n) ?? "gap-3";
  return (
    <div
      className={`bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col ${gap}`}
    >
      {n.image ? (
        <div className="w-full h-40 bg-neutral-800 overflow-hidden">
          {(() => {
            const src = String(n.image);
            const isValid =
              src.startsWith("data:") ||
              src.startsWith("https://") ||
              src.startsWith("http://") ||
              src.startsWith("/");
            return isValid ? (
              <img
                src={src}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const next = e.currentTarget
                    .nextElementSibling as HTMLElement | null;
                  if (next) next.style.display = "flex";
                }}
              />
            ) : null;
          })()}
          <div
            className="w-full h-full items-center justify-center text-neutral-600 text-xs"
            style={{
              display:
                String(n.image).startsWith("data:") ||
                String(n.image).startsWith("https://") ||
                String(n.image).startsWith("/")
                  ? "none"
                  : "flex",
            }}
          >
            🖼️ {String(n.image).slice(0, 60)}
          </div>
        </div>
      ) : null}
      <div className={n.image ? "px-4 pt-2" : "p-4"}>
        {n.title ? (
          <h3 className="text-lg font-semibold text-neutral-100">
            {String(n.title)}
          </h3>
        ) : null}
        {n.subtitle ? (
          <p className="text-xs text-neutral-400 mt-0.5">
            {String(n.subtitle)}
          </p>
        ) : null}
        {n.title || n.subtitle ? <div className="mt-3" /> : null}
        <div className={`flex flex-col ${gap}`}>
          <RenderKids
            kids={n.children as UINode[]}
            localState={localState}
            setLocalValue={setLocalValue}
            onAIEvent={onAIEvent}
          />
        </div>
      </div>
      {n.footer && (n.footer as UINode[]).length > 0 ? (
        <div className="px-4 pb-4 mt-auto pt-2 border-t border-neutral-800 flex items-center gap-2 flex-wrap">
          <RenderKids
            kids={n.footer as UINode[]}
            localState={localState}
            setLocalValue={setLocalValue}
            onAIEvent={onAIEvent}
          />
        </div>
      ) : null}
    </div>
  );
}

function DescriptionListRender({ n }: RSimple) {
  const items = n.items as Array<{
    id: string;
    term: string;
    description: string;
  }>;
  const layout = String(n.layout ?? "vertical");
  const gap = resolveGapClass(n) ?? "gap-2";
  if (layout === "horizontal") {
    return (
      <div
        className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm ${gap}`}
      >
        {items.map((item) => (
          <div key={item.id} className="contents">
            <dt className="text-neutral-400 font-medium">{item.term}</dt>
            <dd className="text-neutral-100">{item.description}</dd>
          </div>
        ))}
      </div>
    );
  }
  return (
    <dl className={`flex flex-col ${gap}`}>
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-0.5">
          <dt className="text-xs text-neutral-400 font-medium">{item.term}</dt>
          <dd className="text-sm text-neutral-100">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyStateRender({ n, localState, onAIEvent }: RProps) {
  const currentUI = useCurrentUI();
  const handleAction = useCallback(() => {
    const action = n.action as { label: string; intent: string } | undefined;
    if (!action) return;
    import("./event").then(
      ({ createComponentClickEvent, createClientSnapshot }) => {
        onAIEvent(
          createComponentClickEvent(
            {
              id: String(n.id),
              type: "button",
              label: action.label,
              intent: action.intent,
            },
            createClientSnapshot(localState, currentUI ?? null),
          ),
        );
      },
    );
  }, [n, localState, currentUI, onAIEvent]);
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {n.icon ? (
        <div className="text-4xl mb-3 text-neutral-600">{String(n.icon)}</div>
      ) : null}
      <h3 className="text-lg font-semibold text-neutral-300">
        {String(n.title)}
      </h3>
      {n.description ? (
        <p className="text-sm text-neutral-500 mt-1 max-w-sm">
          {String(n.description)}
        </p>
      ) : null}
      {n.action ? (
        <button
          onClick={handleAction}
          className="mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          {String((n.action as { label: string }).label)}
        </button>
      ) : null}
    </div>
  );
}

function GaugeRender({ n }: RSimple) {
  const value = Number(n.value);
  const min = Number(n.min);
  const max = Number(n.max);
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const size = String(n.size ?? "md");
  const sc: Record<string, string> = {
    sm: "w-16 h-8",
    md: "w-24 h-12",
    lg: "w-32 h-16",
  };
  const thresholds = n.thresholds as
    | Array<{
        color: string;
        min: number;
        max: number;
        label?: string;
      }>
    | undefined;
  // Determine gauge color from thresholds
  let gaugeColor = "bg-blue-600";
  if (thresholds) {
    for (const th of thresholds) {
      if (value >= th.min && value <= th.max) {
        const cm: Record<string, string> = {
          success: "bg-green-600",
          warning: "bg-yellow-600",
          danger: "bg-red-600",
        };
        gaugeColor = cm[th.color] ?? gaugeColor;
        break;
      }
    }
  }
  return (
    <div className="flex flex-col items-center gap-2">
      {n.title ? (
        <div className="text-xs text-neutral-400">{String(n.title)}</div>
      ) : null}
      <div
        className={`${sc[size] ?? sc.md} relative bg-neutral-800 rounded-t-full overflow-hidden`}
      >
        <div
          className={`absolute bottom-0 left-0 right-0 ${gaugeColor} rounded-t-full transition-all duration-700`}
          style={{ height: `${pct}%` }}
        />
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className="text-xs font-bold text-white drop-shadow">
            {value}
            {n.unit ? String(n.unit) : ""}
          </span>
        </div>
      </div>
      {n.min !== undefined && n.max !== undefined ? (
        <div className="flex justify-between w-full text-[10px] text-neutral-600 px-1">
          <span>
            {min}
            {n.unit ? String(n.unit) : ""}
          </span>
          <span>
            {max}
            {n.unit ? String(n.unit) : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function KPICardRender({ n }: RSimple) {
  const trend = n.trend as string | undefined;
  const tone = String(n.tone ?? "default");
  const tc: Record<string, string> = {
    default: "border-neutral-700",
    primary: "border-blue-700 bg-blue-950/30",
    success: "border-green-700 bg-green-950/30",
    warning: "border-yellow-700 bg-yellow-950/30",
    danger: "border-red-700 bg-red-950/30",
  };
  const trendInfo: Record<string, { color: string; arrow: string }> = {
    up: { color: "text-green-400", arrow: "↑" },
    down: { color: "text-red-400", arrow: "↓" },
    stable: { color: "text-neutral-400", arrow: "→" },
  };
  const ti = trend ? trendInfo[trend] : undefined;
  return (
    <div
      className={`border rounded-xl p-4 flex flex-col gap-1 ${tc[tone] ?? tc.default}`}
    >
      <div className="text-xs text-neutral-400">{String(n.title)}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold text-neutral-100">
          {String(n.value)}
        </span>
        {n.unit ? (
          <span className="text-sm text-neutral-400">{String(n.unit)}</span>
        ) : null}
      </div>
      {ti ? (
        <div className={`flex items-center gap-1 text-xs ${ti.color}`}>
          <span>{ti.arrow}</span>
          {n.trendValue ? <span>{String(n.trendValue)}</span> : null}
        </div>
      ) : null}
      {n.description ? (
        <div className="text-xs text-neutral-500 mt-1">
          {String(n.description)}
        </div>
      ) : null}
    </div>
  );
}

function HeatmapRender({ n }: RSimple) {
  const data = n.data as number[][];
  const xLabels = n.xLabels as string[] | undefined;
  const yLabels = n.yLabels as string[] | undefined;
  const colorScale = String(n.colorScale ?? "blue");
  const cellSize = String(n.cellSize ?? "md");
  const csm: Record<string, string> = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };
  const colors: Record<string, string[]> = {
    blue: [
      "bg-blue-950",
      "bg-blue-900",
      "bg-blue-800",
      "bg-blue-700",
      "bg-blue-600",
      "bg-blue-500",
    ],
    green: [
      "bg-green-950",
      "bg-green-900",
      "bg-green-800",
      "bg-green-700",
      "bg-green-600",
      "bg-green-500",
    ],
    red: [
      "bg-red-950",
      "bg-red-900",
      "bg-red-800",
      "bg-red-700",
      "bg-red-600",
      "bg-red-500",
    ],
    yellow: [
      "bg-yellow-950",
      "bg-yellow-900",
      "bg-yellow-800",
      "bg-yellow-700",
      "bg-yellow-600",
      "bg-yellow-500",
    ],
    purple: [
      "bg-purple-950",
      "bg-purple-900",
      "bg-purple-800",
      "bg-purple-700",
      "bg-purple-600",
      "bg-purple-500",
    ],
  };
  const palette = colors[colorScale] ?? colors.blue;
  const getColor = (val: number) => {
    const idx = Math.min(
      palette.length - 1,
      Math.max(0, Math.floor((val / 100) * palette.length)),
    );
    return palette[idx] ?? palette[0];
  };
  return (
    <div className="flex flex-col gap-2">
      {n.title ? (
        <h4 className="text-sm font-medium text-neutral-300">
          {String(n.title)}
        </h4>
      ) : null}
      <div className="flex">
        {yLabels ? (
          <div className="flex flex-col justify-around pr-2">
            {yLabels.map((label, i) => (
              <span
                key={i}
                className={`${csm[cellSize] ?? csm.md} flex items-center text-[10px] text-neutral-500`}
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex-1">
          {xLabels ? (
            <div className="flex mb-1">
              {xLabels.map((label, i) => (
                <span
                  key={i}
                  className={`${csm[cellSize] ?? csm.md} flex items-center justify-center text-[10px] text-neutral-500`}
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-col gap-px">
            {data.map((row, ri) => (
              <div key={ri} className="flex gap-px">
                {row.map((val, ci) => (
                  <div
                    key={ci}
                    className={`${csm[cellSize] ?? csm.md} rounded-sm ${getColor(val)}`}
                    title={`${val}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorSwatchRender({ n }: RSimple) {
  const colors = n.colors as Array<{ value: string; label?: string }>;
  const size = String(n.size ?? "md");
  const sc: Record<string, string> = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  };
  return (
    <div className="flex flex-col gap-2">
      {n.title ? (
        <h4 className="text-sm font-medium text-neutral-300">
          {String(n.title)}
        </h4>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {colors.map((color, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className={`${sc[size] ?? sc.md} rounded-lg border border-neutral-700`}
              style={{ backgroundColor: color.value }}
              title={color.value}
            />
            {color.label ? (
              <span className="text-[10px] text-neutral-500">
                {color.label}
              </span>
            ) : null}
            <span className="text-[10px] text-neutral-600 font-mono">
              {color.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RadarChartRender({ n }: RSimple) {
  const axes = n.axes as string[];
  const series = n.series as Array<{
    name: string;
    values: number[];
    color?: string;
  }>;
  const maxValue = Number(n.maxValue ?? 100);
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const seriesColors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
  ];
  const getPoint = (value: number, axisIndex: number, totalAxes: number) => {
    const angle = (2 * Math.PI * axisIndex) / totalAxes - Math.PI / 2;
    const r = (value / maxValue) * radius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };
  return (
    <div className="flex flex-col items-center gap-2">
      {n.title ? (
        <h4 className="text-sm font-medium text-neutral-300">
          {String(n.title)}
        </h4>
      ) : null}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        {/* Grid circles */}
        {[0.25, 0.5, 0.75, 1].map((pct) => (
          <circle
            key={pct}
            cx={cx}
            cy={cy}
            r={radius * pct}
            fill="none"
            stroke="#333"
            strokeWidth="0.5"
          />
        ))}
        {/* Axes */}
        {axes.map((_, i) => {
          const pt = getPoint(maxValue, i, axes.length);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={pt.x}
              y2={pt.y}
              stroke="#333"
              strokeWidth="0.5"
            />
          );
        })}
        {/* Data series */}
        {series.map((s, si) => {
          const color = s.color ?? seriesColors[si % seriesColors.length];
          const points = s.values.map((v, i) => getPoint(v, i, axes.length));
          const pathD =
            points
              .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x},${pt.y}`)
              .join(" ") + " Z";
          return (
            <g key={si}>
              <path
                d={pathD}
                fill={color}
                fillOpacity="0.15"
                stroke={color}
                strokeWidth="1.5"
              />
              {points.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r="2.5" fill={color} />
              ))}
            </g>
          );
        })}
        {/* Axis labels */}
        {axes.map((label, i) => {
          const pt = getPoint(maxValue * 1.15, i, axes.length);
          return (
            <text
              key={i}
              x={pt.x}
              y={pt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-neutral-400"
              fontSize="8"
            >
              {label}
            </text>
          );
        })}
      </svg>
      {/* Legend */}
      <div className="flex gap-3 flex-wrap justify-center">
        {series.map((s, si) => (
          <div key={si} className="flex items-center gap-1 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor:
                  s.color ?? seriesColors[si % seriesColors.length],
              }}
            />
            <span className="text-neutral-400">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatGroupRender({ n }: RSimple) {
  const items = n.items as Array<{
    id: string;
    label: string;
    value: string | number;
    unit?: string;
    trend?: string;
    trendValue?: string;
  }>;
  const columns = Number(n.columns ?? 3);
  const gridMap: Record<number, string> = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  };
  const trendInfo: Record<string, { color: string; arrow: string }> = {
    up: { color: "text-green-400", arrow: "↑" },
    down: { color: "text-red-400", arrow: "↓" },
    stable: { color: "text-neutral-400", arrow: "→" },
  };
  return (
    <div
      className={`grid ${gridMap[columns] ?? "grid-cols-3"} ${resolveGapClass(n) ?? "gap-4"}`}
    >
      {items.map((item) => {
        const ti = item.trend ? trendInfo[item.trend] : undefined;
        return (
          <div
            key={item.id}
            className="bg-neutral-800/50 rounded-lg p-3 text-center flex flex-col gap-0.5"
          >
            <div className="text-lg font-bold text-neutral-100">
              {String(item.value)}
              {item.unit ? (
                <span className="text-xs text-neutral-400 ml-0.5">
                  {item.unit}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-neutral-400">{item.label}</div>
            {ti ? (
              <div className={`text-[10px] ${ti.color}`}>
                {ti.arrow} {item.trendValue ?? ""}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StepsRender({ n }: RSimple) {
  const items = n.items as Array<{
    id: string;
    title: string;
    description?: string;
    status?: string;
  }>;
  const current = Number(n.current);
  const direction = String(n.direction ?? "horizontal");
  const isVertical = direction === "vertical";
  const sc: Record<string, { dot: string; line: string; text: string }> = {
    wait: {
      dot: "bg-neutral-700 border-neutral-600",
      line: "bg-neutral-700",
      text: "text-neutral-500",
    },
    process: {
      dot: "bg-blue-600 border-blue-500 animate-pulse",
      line: "bg-blue-600",
      text: "text-neutral-100",
    },
    finish: {
      dot: "bg-green-600 border-green-500",
      line: "bg-green-600",
      text: "text-neutral-200",
    },
    error: {
      dot: "bg-red-600 border-red-500",
      line: "bg-red-600",
      text: "text-red-300",
    },
  };
  return (
    <div className={`flex ${isVertical ? "flex-col" : "flex-row"}`}>
      {items.map((item, i) => {
        const status =
          item.status ??
          (i < current ? "finish" : i === current ? "process" : "wait");
        const style = sc[status] ?? sc.wait;
        return (
          <div
            key={item.id}
            className={`flex ${isVertical ? "items-start gap-3" : "flex-1 flex-col items-center"}`}
          >
            {!isVertical ? (
              <div className="flex items-center w-full">
                {i > 0 ? (
                  <div
                    className={`flex-1 h-0.5 ${(sc[items[i - 1]?.status ?? (i - 1 < current ? "finish" : "wait")] ?? sc.wait).line}`}
                  />
                ) : (
                  <div className="flex-1" />
                )}
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${style.dot} text-white`}
                >
                  {status === "finish" ? "✓" : status === "error" ? "✕" : i + 1}
                </div>
                {i < items.length - 1 ? (
                  <div className={`flex-1 h-0.5 ${style.line}`} />
                ) : (
                  <div className="flex-1" />
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${style.dot} text-white`}
                >
                  {status === "finish" ? "✓" : status === "error" ? "✕" : i + 1}
                </div>
                {i < items.length - 1 ? (
                  <div className={`w-0.5 h-6 ${style.line}`} />
                ) : null}
              </div>
            )}
            <div
              className={`mt-1.5 ${isVertical ? "mt-0 flex-1" : "text-center"}`}
            >
              <div className={`text-xs font-medium ${style.text}`}>
                {item.title}
              </div>
              {item.description ? (
                <div className="text-[10px] text-neutral-500 mt-0.5">
                  {item.description}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------
// Image Render — 渲染 image 节点
// -----------------------------------------------------------

/* eslint-disable @next/next/no-img-element -- 通用 UI 渲染器，不使用 next/image 优化 */

/** 宽度 token → Tailwind class */
const IMG_WIDTH_CLASS: Record<string, string> = {
  auto: "w-auto",
  full: "w-full",
  content: "max-w-max",
  "1/2": "w-1/2",
  "1/3": "w-1/3",
  "2/3": "w-2/3",
  "1/4": "w-1/4",
  "3/4": "w-3/4",
};

/** 高度 token → Tailwind class */
const IMG_HEIGHT_CLASS: Record<string, string> = {
  auto: "h-auto",
  content: "max-h-max",
  "1/2": "h-48",
  "1/3": "h-32",
};

/** fit → Tailwind object-fit */
const IMG_FIT_CLASS: Record<string, string> = {
  cover: "object-cover",
  contain: "object-contain",
  fill: "object-fill",
  none: "object-none",
};

/** radius → Tailwind rounded */
const IMG_RADIUS_CLASS: Record<string, string> = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
};

function ImageRender({ n }: { n: Record<string, unknown> }) {
  const src = String(n.src ?? "");
  const alt = String(n.alt ?? "");
  const caption = typeof n.caption === "string" ? n.caption : undefined;
  const fitClass = IMG_FIT_CLASS[String(n.fit ?? "cover")] ?? "object-cover";
  const radiusClass =
    IMG_RADIUS_CLASS[String(n.radius ?? "md")] ?? "rounded-md";
  const widthClass = IMG_WIDTH_CLASS[String(n.width ?? "full")] ?? "w-full";
  const heightClass = IMG_HEIGHT_CLASS[String(n.height ?? "auto")] ?? "h-auto";
  const source = n.source as { name?: string; url?: string } | undefined;

  // 安全校验：允许 data: URLs、https: URLs、http: URLs 和相对路径
  const isValidSrc =
    src.startsWith("data:") ||
    src.startsWith("https://") ||
    src.startsWith("http://") ||
    src.startsWith("/");

  return (
    <figure className={`${widthClass} overflow-hidden`}>
      {isValidSrc ? (
        <img
          src={src}
          alt={alt}
          className={`${widthClass} ${heightClass} ${fitClass} ${radiusClass} bg-neutral-800`}
          loading="lazy"
          onError={(e) => {
            const target = e.currentTarget;
            target.style.display = "none";
            const placeholder = target.nextElementSibling as HTMLElement | null;
            if (placeholder) placeholder.style.display = "flex";
          }}
        />
      ) : null}
      <div
        className={`${widthClass} ${heightClass} ${radiusClass} bg-neutral-800 border border-neutral-700 items-center justify-center min-h-[120px]`}
        style={{ display: isValidSrc ? "none" : "flex" }}
      >
        <span className="text-neutral-500 text-sm">
          {isValidSrc ? "" : src ? "⚠️ 不安全的图片来源" : "🖼️ 无图片"}
        </span>
      </div>
      {caption ? (
        <figcaption className="mt-2 text-xs text-neutral-400 text-center">
          {caption}
        </figcaption>
      ) : null}
      {source?.name ? (
        <div className="mt-1 text-[10px] text-neutral-600 text-center">
          来源:{" "}
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-400 underline"
            >
              {source.name}
            </a>
          ) : (
            source.name
          )}
        </div>
      ) : null}
    </figure>
  );
}

/* eslint-enable @next/next/no-img-element */
