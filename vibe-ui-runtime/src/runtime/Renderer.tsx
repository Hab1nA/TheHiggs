"use client";

import React, { useState, useCallback, useRef } from "react";
import type { UINode, AUIREvent } from "@/src/auir/types";
import {
  createComponentClickEvent,
  createValueChangeEvent,
  createTabChangeEvent,
  createModalCloseEvent,
} from "./event";

// ============================================================
// Renderer — Recursively renders AUIR UI nodes
// ============================================================

type RendererProps = {
  node: UINode;
  onEvent: (event: AUIREvent) => void;
};

export default function Renderer({ node, onEvent }: RendererProps) {
  if (node.visible === false) return null;
  return <NodeRenderer node={node} onEvent={onEvent} />;
}

function NodeRenderer({ node, onEvent }: { node: UINode; onEvent: (e: AUIREvent) => void }) {
  switch (node.type) {
    case "screen":
      return <ScreenRenderer node={node} onEvent={onEvent} />;
    case "container":
      return <ContainerRenderer node={node} onEvent={onEvent} />;
    case "panel":
      return <PanelRenderer node={node} onEvent={onEvent} />;
    case "heading":
      return <HeadingRenderer node={node} />;
    case "text":
      return <TextRenderer node={node} />;
    case "button":
      return <ButtonRenderer node={node} onEvent={onEvent} />;
    case "text_input":
      return <TextInputRenderer node={node} onEvent={onEvent} />;
    case "number_input":
      return <NumberInputRenderer node={node} onEvent={onEvent} />;
    case "textarea":
      return <TextareaRenderer node={node} onEvent={onEvent} />;
    case "select":
      return <SelectRenderer node={node} onEvent={onEvent} />;
    case "checkbox":
      return <CheckboxRenderer node={node} onEvent={onEvent} />;
    case "slider":
      return <SliderRenderer node={node} onEvent={onEvent} />;
    case "table":
      return <TableRenderer node={node} />;
    case "metric":
      return <MetricRenderer node={node} />;
    case "alert":
      return <AlertRenderer node={node} />;
    case "tabs":
      return <TabsRenderer node={node} onEvent={onEvent} />;
    case "modal":
      return <ModalRenderer node={node} onEvent={onEvent} />;
    case "code_block":
      return <CodeBlockRenderer node={node} />;
    case "chart_bar":
      return <ChartBarRenderer node={node} />;
    case "chart_line":
      return <ChartLineRenderer node={node} />;
    default:
      return (
        <div className="text-neutral-500 text-sm p-2 border border-dashed border-neutral-700 rounded">
          Unknown node type: {node.type}
        </div>
      );
  }
}

// --- Screen ---
function ScreenRenderer({
  node,
  onEvent,
}: {
  node: import("@/src/auir/types").ScreenNode;
  onEvent: (e: AUIREvent) => void;
}) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      {node.title && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-100">{node.title}</h1>
        </div>
      )}
      <div className="flex flex-col gap-4">
        {node.children.map((child) => (
          <NodeRenderer key={child.id} node={child} onEvent={onEvent} />
        ))}
      </div>
    </div>
  );
}

// --- Container ---
function ContainerRenderer({
  node,
  onEvent,
}: {
  node: import("@/src/auir/types").ContainerNode;
  onEvent: (e: AUIREvent) => void;
}) {
  const gapClass = {
    xs: "gap-1",
    sm: "gap-2",
    md: "gap-4",
    lg: "gap-6",
  }[node.gap ?? "md"];

  const directionClass =
    node.direction === "row"
      ? "flex flex-row flex-wrap"
      : node.direction === "grid"
      ? "grid grid-cols-1 md:grid-cols-2"
      : "flex flex-col";

  return (
    <div className={`${directionClass} ${gapClass}`}>
      {node.children.map((child) => (
        <NodeRenderer key={child.id} node={child} onEvent={onEvent} />
      ))}
    </div>
  );
}

// --- Panel ---
function PanelRenderer({
  node,
  onEvent,
}: {
  node: import("@/src/auir/types").PanelNode;
  onEvent: (e: AUIREvent) => void;
}) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">
      {node.title && (
        <h2 className="text-lg font-semibold text-neutral-200 border-b border-neutral-800 pb-2">
          {node.title}
        </h2>
      )}
      {node.children.map((child) => (
        <NodeRenderer key={child.id} node={child} onEvent={onEvent} />
      ))}
    </div>
  );
}

// --- Heading ---
function HeadingRenderer({
  node,
}: {
  node: import("@/src/auir/types").HeadingNode;
}) {
  const Tag = `h${node.level ?? 2}` as keyof JSX.IntrinsicElements;
  const sizeClass = {
    1: "text-2xl font-bold",
    2: "text-xl font-semibold",
    3: "text-lg font-medium",
    4: "text-base font-medium",
  }[node.level ?? 2];
  return <Tag className={`${sizeClass} text-neutral-100`}>{node.text}</Tag>;
}

// --- Text ---
function TextRenderer({ node }: { node: import("@/src/auir/types").TextNode }) {
  const toneClass = {
    default: "text-neutral-100",
    muted: "text-neutral-400",
    success: "text-green-400",
    warning: "text-yellow-400",
    danger: "text-red-400",
  }[node.tone ?? "default"];
  return <p className={`text-sm ${toneClass}`}>{node.text}</p>;
}

// --- Button ---
function ButtonRenderer({
  node,
  onEvent,
}: {
  node: import("@/src/auir/types").ButtonNode;
  onEvent: (e: AUIREvent) => void;
}) {
  const variantClass = {
    primary:
      "bg-blue-600 hover:bg-blue-500 text-white border-blue-500",
    secondary:
      "bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700",
    ghost:
      "bg-transparent hover:bg-neutral-800 text-neutral-300 border-transparent",
    danger:
      "bg-red-700 hover:bg-red-600 text-white border-red-600",
  }[node.variant ?? "primary"];

  const handleClick = useCallback(() => {
    onEvent(
      createComponentClickEvent(node.id, "button", node.label, node.intent)
    );
  }, [node.id, node.label, node.intent, onEvent]);

  return (
    <button
      onClick={handleClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors duration-150 ${variantClass}`}
    >
      {node.label}
    </button>
  );
}

// --- Text Input ---
function TextInputRenderer({
  node,
  onEvent,
}: {
  node: import("@/src/auir/types").TextInputNode;
  onEvent: (e: AUIREvent) => void;
}) {
  const [localValue, setLocalValue] = useState(node.value ?? "");
  const prevRef = useRef(node.value);

  // Sync external value changes
  if (node.value !== undefined && node.value !== prevRef.current && node.value !== localValue) {
    prevRef.current = node.value;
    // Only sync if not currently focused (simple heuristic)
  }

  const handleBlur = useCallback(() => {
    onEvent(
      createValueChangeEvent(
        node.id,
        "text_input",
        node.binding,
        node.value,
        localValue
      )
    );
  }, [node.id, node.binding, node.value, localValue, onEvent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        (e.target as HTMLInputElement).blur();
      }
    },
    []
  );

  return (
    <div className="flex flex-col gap-1">
      {node.label && (
        <label className="text-xs text-neutral-400 font-medium">
          {node.label}
        </label>
      )}
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={node.placeholder}
        className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}

// --- Number Input ---
function NumberInputRenderer({
  node,
  onEvent,
}: {
  node: import("@/src/auir/types").NumberInputNode;
  onEvent: (e: AUIREvent) => void;
}) {
  const [localValue, setLocalValue] = useState(
    node.value !== undefined ? String(node.value) : ""
  );

  const handleBlur = useCallback(() => {
    const num = parseFloat(localValue);
    if (!isNaN(num)) {
      onEvent(
        createValueChangeEvent(
          node.id,
          "number_input",
          node.binding,
          node.value,
          num
        )
      );
    }
  }, [node.id, node.binding, node.value, localValue, onEvent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        (e.target as HTMLInputElement).blur();
      }
    },
    []
  );

  return (
    <div className="flex flex-col gap-1">
      {node.label && (
        <label className="text-xs text-neutral-400 font-medium">
          {node.label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={node.placeholder}
          className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
        />
        {node.unit && (
          <span className="text-xs text-neutral-500 whitespace-nowrap">
            {node.unit}
          </span>
        )}
      </div>
    </div>
  );
}

// --- Textarea ---
function TextareaRenderer({
  node,
  onEvent,
}: {
  node: import("@/src/auir/types").TextareaNode;
  onEvent: (e: AUIREvent) => void;
}) {
  const [localValue, setLocalValue] = useState(node.value ?? "");

  const handleBlur = useCallback(() => {
    onEvent(
      createValueChangeEvent(
        node.id,
        "textarea",
        node.binding,
        node.value,
        localValue
      )
    );
  }, [node.id, node.binding, node.value, localValue, onEvent]);

  return (
    <div className="flex flex-col gap-1">
      {node.label && (
        <label className="text-xs text-neutral-400 font-medium">
          {node.label}
        </label>
      )}
      <textarea
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        placeholder={node.placeholder}
        rows={4}
        className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
      />
    </div>
  );
}

// --- Select ---
function SelectRenderer({
  node,
  onEvent,
}: {
  node: import("@/src/auir/types").SelectNode;
  onEvent: (e: AUIREvent) => void;
}) {
  const [localValue, setLocalValue] = useState(node.value ?? "");

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newVal = e.target.value;
      setLocalValue(newVal);
      onEvent(
        createValueChangeEvent(
          node.id,
          "select",
          node.binding,
          node.value,
          newVal
        )
      );
    },
    [node.id, node.binding, node.value, onEvent]
  );

  return (
    <div className="flex flex-col gap-1">
      {node.label && (
        <label className="text-xs text-neutral-400 font-medium">
          {node.label}
        </label>
      )}
      <select
        value={localValue}
        onChange={handleChange}
        className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {node.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// --- Checkbox ---
function CheckboxRenderer({
  node,
  onEvent,
}: {
  node: import("@/src/auir/types").CheckboxNode;
  onEvent: (e: AUIREvent) => void;
}) {
  const [checked, setChecked] = useState(node.checked);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newChecked = e.target.checked;
      setChecked(newChecked);
      onEvent(
        createValueChangeEvent(
          node.id,
          "checkbox",
          node.binding,
          node.checked,
          newChecked
        )
      );
    },
    [node.id, node.binding, node.checked, onEvent]
  );

  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        className="rounded bg-neutral-800 border-neutral-700 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-neutral-200">{node.label}</span>
    </label>
  );
}

// --- Slider ---
function SliderRenderer({
  node,
  onEvent,
}: {
  node: import("@/src/auir/types").SliderNode;
  onEvent: (e: AUIREvent) => void;
}) {
  const [localValue, setLocalValue] = useState(node.value);

  const handleMouseUp = useCallback(() => {
    onEvent(
      createValueChangeEvent(
        node.id,
        "slider",
        node.binding,
        node.value,
        localValue
      )
    );
  }, [node.id, node.binding, node.value, localValue, onEvent]);

  return (
    <div className="flex flex-col gap-1">
      {node.label && (
        <label className="text-xs text-neutral-400 font-medium">
          {node.label}: {localValue}
          {node.unit ? ` ${node.unit}` : ""}
        </label>
      )}
      <input
        type="range"
        value={localValue}
        onChange={(e) => setLocalValue(Number(e.target.value))}
        onMouseUp={handleMouseUp}
        min={node.min}
        max={node.max}
        step={node.step ?? 1}
        className="w-full accent-blue-600"
      />
    </div>
  );
}

// --- Table ---
function TableRenderer({ node }: { node: import("@/src/auir/types").TableNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="border-b border-neutral-700">
            {node.columns.map((col, i) => (
              <th
                key={i}
                className="px-3 py-2 text-neutral-400 font-medium text-xs uppercase tracking-wider"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {node.rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-neutral-800 hover:bg-neutral-800/50 transition-colors"
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-neutral-200">
                  {cell === null ? (
                    <span className="text-neutral-600">—</span>
                  ) : (
                    String(cell)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Metric ---
function MetricRenderer({
  node,
}: {
  node: import("@/src/auir/types").MetricNode;
}) {
  const confidenceBadge = node.confidence
    ? {
        real: "bg-green-900/50 text-green-400 border-green-800",
        simulated: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
        estimated: "bg-blue-900/50 text-blue-400 border-blue-800",
      }[node.confidence]
    : "";

  return (
    <div className="bg-neutral-800 rounded-lg p-3 border border-neutral-700">
      <div className="text-xs text-neutral-400 mb-1">{node.label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-neutral-100">
          {node.value}
        </span>
        {node.unit && (
          <span className="text-sm text-neutral-400">{node.unit}</span>
        )}
      </div>
      {node.confidence && (
        <span
          className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${confidenceBadge}`}
        >
          {node.confidence}
        </span>
      )}
    </div>
  );
}

// --- Alert ---
function AlertRenderer({ node }: { node: import("@/src/auir/types").AlertNode }) {
  const toneClass = {
    info: "bg-blue-950 border-blue-800 text-blue-300",
    success: "bg-green-950 border-green-800 text-green-300",
    warning: "bg-yellow-950 border-yellow-800 text-yellow-300",
    danger: "bg-red-950 border-red-800 text-red-300",
  }[node.tone];

  return (
    <div className={`border rounded-lg p-3 ${toneClass}`}>
      {node.title && (
        <div className="font-semibold text-sm mb-1">{node.title}</div>
      )}
      <div className="text-sm opacity-90">{node.message}</div>
    </div>
  );
}

// --- Tabs ---
function TabsRenderer({
  node,
  onEvent,
}: {
  node: import("@/src/auir/types").TabsNode;
  onEvent: (e: AUIREvent) => void;
}) {
  const [activeTab, setActiveTab] = useState(node.activeTab);
  const currentTab = node.tabs.find((t) => t.id === activeTab);

  const handleTabClick = useCallback(
    (tabId: string) => {
      const prev = activeTab;
      setActiveTab(tabId);
      onEvent(createTabChangeEvent(node.id, prev, tabId));
    },
    [node.id, activeTab, onEvent]
  );

  return (
    <div>
      <div className="flex border-b border-neutral-700 mb-3">
        {node.tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {currentTab && (
        <div className="flex flex-col gap-3">
          {currentTab.children.map((child) => (
            <NodeRenderer key={child.id} node={child} onEvent={onEvent} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Modal ---
function ModalRenderer({
  node,
  onEvent,
}: {
  node: import("@/src/auir/types").ModalNode;
  onEvent: (e: AUIREvent) => void;
}) {
  const handleClose = useCallback(() => {
    onEvent(createModalCloseEvent(node.id, node.closeIntent));
  }, [node.id, node.closeIntent, onEvent]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleClose();
    },
    [handleClose]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h3 className="text-lg font-semibold text-neutral-100">
            {node.title}
          </h3>
          <button
            onClick={handleClose}
            className="text-neutral-400 hover:text-neutral-200 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {node.children.map((child) => (
            <NodeRenderer key={child.id} node={child} onEvent={onEvent} />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Code Block ---
function CodeBlockRenderer({
  node,
}: {
  node: import("@/src/auir/types").CodeBlockNode;
}) {
  return (
    <pre className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 overflow-x-auto">
      <code className="text-sm text-neutral-200 font-mono whitespace-pre">
        {node.language && (
          <div className="text-xs text-neutral-500 mb-1">{node.language}</div>
        )}
        {node.code}
      </code>
    </pre>
  );
}

// --- Chart Bar ---
function ChartBarRenderer({
  node,
}: {
  node: import("@/src/auir/types").ChartBarNode;
}) {
  const maxVal = Math.max(...node.data.map((d) => d.value), 1);

  return (
    <div>
      {node.title && (
        <h4 className="text-sm font-medium text-neutral-300 mb-3">
          {node.title}
        </h4>
      )}
      <div className="flex items-end gap-3 h-40">
        {node.data.map((d) => (
          <div
            key={d.label}
            className="flex flex-col items-center gap-1 flex-1"
          >
            <span className="text-xs text-neutral-400">
              {d.value}
              {node.yLabel ? ` ${node.yLabel}` : ""}
            </span>
            <div
              className="w-full bg-blue-600 rounded-t-md transition-all duration-300 min-h-[4px]"
              style={{
                height: `${Math.max((d.value / maxVal) * 100, 2)}%`,
              }}
            />
            <span className="text-[10px] text-neutral-500 mt-1 truncate w-full text-center">
              {d.label}
            </span>
          </div>
        ))}
      </div>
      {node.xLabel && (
        <div className="text-xs text-neutral-500 text-center mt-2">
          {node.xLabel}
        </div>
      )}
    </div>
  );
}

// --- Chart Line (simplified SVG) ---
function ChartLineRenderer({
  node,
}: {
  node: import("@/src/auir/types").ChartLineNode;
}) {
  const w = 300;
  const h = 150;
  const pad = 20;
  const xs = node.data.map((_, i) =>
    pad + (i / Math.max(node.data.length - 1, 1)) * (w - 2 * pad)
  );
  const maxY = Math.max(...node.data.map((d) => d.y), 1);
  const ys = node.data.map(
    (d) => h - pad - (d.y / maxY) * (h - 2 * pad)
  );
  const pathD = xs
    .map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${ys[i]}`)
    .join(" ");

  return (
    <div>
      {node.title && (
        <h4 className="text-sm font-medium text-neutral-300 mb-3">
          {node.title}
        </h4>
      )}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full max-w-md bg-neutral-800 rounded-lg border border-neutral-700"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = h - pad - frac * (h - 2 * pad);
          return (
            <line
              key={frac}
              x1={pad}
              x2={w - pad}
              y1={y}
              y2={y}
              stroke="#374151"
              strokeDasharray="4 4"
            />
          );
        })}
        {/* Line */}
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" />
        {/* Dots */}
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r="3" fill="#3b82f6" />
        ))}
        {/* X labels */}
        {node.data.map((d, i) => (
          <text
            key={i}
            x={xs[i]}
            y={h - 4}
            textAnchor="middle"
            fill="#9ca3af"
            fontSize="8"
          >
            {d.x}
          </text>
        ))}
      </svg>
    </div>
  );
}
