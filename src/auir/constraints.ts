// ============================================================
// AUIR Constraints — 默认运行时约束
// ============================================================

import type { AUIRConstraints } from "./types";

export const ALLOWED_COMPONENTS = [
  "screen",
  "container",
  "grid",
  "split",
  "region",
  "toolbar",
  "spacer",
  "divider",
  "panel",
  "heading",
  "text",
  "button",
  "text_input",
  "number_input",
  "textarea",
  "select",
  "checkbox",
  "slider",
  "stepper",
  "local_value_display",
  "table",
  "metric",
  "alert",
  "tabs",
  "modal",
  "drawer",
  "code_block",
  "chart_bar",
  "chart_line",
  // v0.3.1 — Extended Components
  "carousel",
  "badge",
  "progress",
  "statistic",
  "timeline",
  "accordion",
  "breadcrumb",
  "tag",
  "list",
  "quote",
  "card",
  "description_list",
  "empty_state",
  "gauge",
  "kpi_card",
  "heatmap",
  "color_swatch",
  "radar_chart",
  "stat_group",
  "steps",
] as const;

export const defaultConstraints: AUIRConstraints = {
  renderMode: "full_state",
  allowedComponents: [...ALLOWED_COMPONENTS],
  maxNodes: 120,
  maxDepth: 10,
  maxTextLength: 6000,
  allowExternalData: false,
  allowCodeExecution: false,
  allowToolUse: false,
  styleSystem: "semantic_tokens_only",
  layoutPolicy: {
    allowMultiColumn: true,
    allowGrid: true,
    allowSplitView: true,
    maxGridColumns: 4,
    maxRegions: 8,
  },
  interactionPolicy: {
    defaultInputMode: "local",
    defaultButtonMode: "ai_transition",
    requireClientSnapshotForAITransition: true,
    allowLocalActions: true,
    allowDebouncedAITransitions: false,
  },
  transitionPolicy: {
    preferMinimalChange: true,
    preserveStableIds: true,
    preserveUserInputs: true,
    allowMajorRedesignOnlyOn: ["app.search", "explicit_redesign_request"],
  },
};

/** Run relaxed constraints for more creative UI generation */
export const relaxedConstraints: AUIRConstraints = {
  ...defaultConstraints,
  maxNodes: 200,
  maxDepth: 12,
  layoutPolicy: {
    ...defaultConstraints.layoutPolicy,
    maxGridColumns: 6,
    maxRegions: 12,
  },
};

export function mergeConstraints(
  base: AUIRConstraints,
  overrides: Partial<AUIRConstraints>,
): AUIRConstraints {
  return {
    ...base,
    ...overrides,
    layoutPolicy: { ...base.layoutPolicy, ...overrides.layoutPolicy },
    interactionPolicy: {
      ...base.interactionPolicy,
      ...overrides.interactionPolicy,
    },
    transitionPolicy: {
      ...base.transitionPolicy,
      ...overrides.transitionPolicy,
    },
  };
}
