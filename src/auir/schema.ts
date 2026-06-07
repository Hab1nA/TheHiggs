// ============================================================
// AUIR Zod Schema — 运行时校验 + AI 模型输出合同
// ============================================================

import { z } from "zod";
import type { UINode } from "./types";

// -----------------------------------------------------------
// 基础枚举
// -----------------------------------------------------------

const semanticRoleSchema = z.enum([
  "navigation",
  "input",
  "analysis_action",
  "local_adjustment",
  "display",
  "warning",
  "confirmation",
  "tool_result",
  "simulation_result",
]);

const interactionModeSchema = z.enum(["local", "ai_transition", "hybrid"]);
const commitTriggerSchema = z.enum([
  "blur",
  "enter",
  "change",
  "click",
  "submit",
]);

const interactionPolicySchema = z.object({
  mode: interactionModeSchema,
  commitOn: z.array(commitTriggerSchema).optional(),
  includeLocalStateOnCommit: z.boolean().optional(),
  debounceMs: z.number().optional(),
});

const nodeLayoutHintsSchema = z.object({
  width: z
    .enum(["auto", "full", "content", "1/2", "1/3", "2/3", "1/4", "3/4"])
    .optional(),
  height: z.enum(["auto", "full", "content"]).optional(),
  align: z.enum(["start", "center", "end", "stretch"]).optional(),
  justify: z.enum(["start", "center", "end", "between"]).optional(),
  grow: z.boolean().optional(),
  order: z.number().optional(),
});

const nodeStyleTokensSchema = z.object({
  tone: z
    .enum(["default", "muted", "primary", "success", "warning", "danger"])
    .optional(),
  density: z.enum(["compact", "normal", "spacious"]).optional(),
  emphasis: z.enum(["low", "medium", "high"]).optional(),
});

const baseNodeExtras = {
  id: z.string(),
  visible: z.boolean().optional(),
  semanticRole: semanticRoleSchema.optional(),
  intent: z.string().optional(),
  expectedEffect: z.string().optional(),
  layout: nodeLayoutHintsSchema.optional(),
  style: nodeStyleTokensSchema.optional(),
};

// -----------------------------------------------------------
// Forward-declare recursive UI node reference
// -----------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _uiNode: z.ZodType<any> = z.lazy(() => uiNodeSchema);
const _ui: z.ZodType<UINode> = _uiNode as z.ZodType<UINode>;
const _uiArray = z.array(_uiNode);

// -----------------------------------------------------------
// UI Node Schemas
// -----------------------------------------------------------

const screenNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("screen"),
  title: z.string().optional(),
  layoutMode: z
    .enum(["single", "dashboard", "workspace", "document", "wizard"])
    .optional(),
  gap: z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
  children: _uiArray,
});

const containerNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("container"),
  direction: z.enum(["row", "column", "grid"]).optional(),
  gap: z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
  wrap: z.boolean().optional(),
  columns: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ])
    .optional(),
  children: _uiArray,
});

const gridNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("grid"),
  columns: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal("auto"),
  ]),
  gap: z.enum(["xs", "sm", "md", "lg"]).optional(),
  children: _uiArray,
});

const splitNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("split"),
  orientation: z.enum(["horizontal", "vertical"]),
  ratio: z.enum(["1:1", "1:2", "2:1", "1:3", "3:1"]).optional(),
  primary: _ui,
  secondary: _ui,
});

const regionNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("region"),
  region: z.enum([
    "header",
    "sidebar",
    "main",
    "inspector",
    "footer",
    "toolbar",
    "results",
    "logs",
  ]),
  gap: z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
  children: _uiArray,
});

const toolbarNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("toolbar"),
  gap: z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
  children: _uiArray,
});

const spacerNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("spacer"),
  size: z.enum(["xs", "sm", "md", "lg"]).optional(),
});

const dividerNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("divider"),
  orientation: z.enum(["horizontal", "vertical"]).optional(),
});

const panelNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("panel"),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  gap: z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
  children: _uiArray,
});

const headingNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("heading"),
  text: z.string(),
  level: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
});

const textNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("text"),
  text: z.string(),
});

const imageNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("image"),
  src: z.string().describe("Image URL (data: URL or server-proxied safe URL)"),
  alt: z.string().optional(),
  width: z
    .enum(["auto", "full", "content", "1/2", "1/3", "2/3", "1/4", "3/4"])
    .optional(),
  height: z.enum(["auto", "content", "1/2", "1/3"]).optional(),
  fit: z.enum(["cover", "contain", "fill", "none"]).optional(),
  radius: z.enum(["none", "sm", "md", "lg", "full"]).optional(),
  caption: z.string().optional(),
  source: z
    .object({
      name: z.string(),
      url: z.string().optional(),
    })
    .optional(),
});

const metricNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("metric"),
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  confidence: z.enum(["real", "simulated", "estimated"]).optional(),
});

export const imageSlotPlanItemSchema = z.object({
  slotId: z.string().describe("Unique slot identifier, e.g. s1, s2"),
  purpose: z
    .string()
    .describe(
      "Semantic purpose for this image, e.g. hero cover, card thumbnail, section illustration",
    ),
  queryCandidates: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("2-4 precise search queries for this slot"),
  preferredAspect: z
    .enum(["16:9", "4:3", "3:2", "1:1", "3:4", "auto"])
    .optional()
    .describe("Preferred aspect ratio when multiple candidates exist"),
  required: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether the final UI must include an image for this slot"),
  bindTarget: z.object({
    type: z.enum(["image", "card"]),
    nodeId: z.string().optional(),
    sectionHint: z.string().optional(),
  }),
});

export const imageBlueprintSchema = z.object({
  summary: z
    .string()
    .optional()
    .describe("Short summary of why these images are needed"),
  slots: z
    .array(imageSlotPlanItemSchema)
    .min(0)
    .max(12)
    .describe("Planned image slots that need real images"),
});

export type ImageSlotPlanItem = z.infer<typeof imageSlotPlanItemSchema>;
export type ImageBlueprint = z.infer<typeof imageBlueprintSchema>;

const alertNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("alert"),
  title: z.string().optional(),
  message: z.string(),
  tone: z.enum(["info", "success", "warning", "danger"]),
});

const codeBlockNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("code_block"),
  language: z.string().optional(),
  code: z.string(),
});

const tableNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("table"),
  columns: z.array(z.string()),
  rows: z.array(
    z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  ),
});

const localActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["increment", "decrement"]),
    binding: z.string(),
    step: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({
    type: z.literal("set_value"),
    binding: z.string(),
    value: z.unknown(),
  }),
  z.object({
    type: z.literal("toggle"),
    binding: z.string(),
  }),
]);

const buttonNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("button"),
  label: z.string(),
  intent: z.string(),
  variant: z.enum(["primary", "secondary", "ghost", "danger"]).optional(),
  interaction: interactionPolicySchema.optional(),
  localAction: localActionSchema.optional(),
});

const textInputNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("text_input"),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  value: z.string().optional(),
  binding: z.string(),
  interaction: interactionPolicySchema.optional(),
});

const numberInputNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("number_input"),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  value: z.number().optional(),
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  binding: z.string(),
  interaction: interactionPolicySchema.optional(),
});

const textareaNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("textarea"),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  value: z.string().optional(),
  binding: z.string(),
  interaction: interactionPolicySchema.optional(),
});

const selectNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("select"),
  label: z.string().optional(),
  value: z.string().optional(),
  binding: z.string(),
  options: z.array(z.object({ label: z.string(), value: z.string() })),
  interaction: interactionPolicySchema.optional(),
});

const checkboxNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("checkbox"),
  label: z.string(),
  checked: z.boolean(),
  binding: z.string(),
  interaction: interactionPolicySchema.optional(),
});

const sliderNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("slider"),
  label: z.string().optional(),
  value: z.number(),
  min: z.number(),
  max: z.number(),
  step: z.number().optional(),
  unit: z.string().optional(),
  binding: z.string(),
  interaction: interactionPolicySchema.optional(),
});

const stepperNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("stepper"),
  label: z.string().optional(),
  value: z.number(),
  binding: z.string(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  unit: z.string().optional(),
  interaction: interactionPolicySchema.optional(),
});

export const externalLinkNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("external_link"),
  label: z.string(),
  url: z.string(),
  variant: z.enum(["primary", "secondary", "ghost", "danger"]).optional(),
});

const localValueDisplayNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("local_value_display"),
  label: z.string().optional(),
  binding: z.string(),
  unit: z.string().optional(),
  format: z.enum(["plain", "fixed_1", "fixed_2", "scientific"]).optional(),
});

const tabsNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("tabs"),
  activeTab: z.string(),
  gap: z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
  tabs: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      children: _uiArray,
    }),
  ),
  interaction: interactionPolicySchema.optional(),
});

const modalNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("modal"),
  title: z.string(),
  children: _uiArray,
  closeIntent: z.string(),
});

const drawerNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("drawer"),
  title: z.string(),
  side: z.enum(["left", "right", "bottom"]),
  children: _uiArray,
  closeIntent: z.string(),
});

const chartBarNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("chart_bar"),
  title: z.string().optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  data: z.array(z.object({ label: z.string(), value: z.number() })),
});

const chartLineNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("chart_line"),
  title: z.string().optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  data: z.array(
    z.object({ x: z.union([z.string(), z.number()]), y: z.number() }),
  ),
});

// -----------------------------------------------------------
// v0.3.1 — Extended Node Schemas
// -----------------------------------------------------------

const carouselNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("carousel"),
  title: z.string().optional(),
  gap: z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
  visibleItems: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
  children: _uiArray,
});

const badgeNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("badge"),
  text: z.string(),
  variant: z
    .enum(["default", "primary", "success", "warning", "danger", "info"])
    .optional(),
  size: z.enum(["sm", "md", "lg"]).optional(),
});

const progressNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("progress"),
  label: z.string().optional(),
  value: z.number(),
  max: z.number().optional(),
  unit: z.string().optional(),
  tone: z
    .enum(["default", "primary", "success", "warning", "danger"])
    .optional(),
});

const statisticNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("statistic"),
  title: z.string(),
  value: z.union([z.string(), z.number()]),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  trend: z.enum(["up", "down", "stable"]).optional(),
  trendValue: z.string().optional(),
  description: z.string().optional(),
});

const timelineNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("timeline"),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      timestamp: z.string().optional(),
      tone: z
        .enum(["default", "primary", "success", "warning", "danger"])
        .optional(),
      icon: z.string().optional(),
    }),
  ),
});

const accordionNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("accordion"),
  defaultOpenIndex: z.number().optional(),
  gap: z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      children: _uiArray,
    }),
  ),
});

const breadcrumbNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("breadcrumb"),
  items: z.array(
    z.object({
      label: z.string(),
      href: z.string().optional(),
    }),
  ),
  separator: z.enum(["/", ">", "›"]).optional(),
});

const tagNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("tag"),
  text: z.string(),
  variant: z
    .enum(["default", "primary", "success", "warning", "danger", "info"])
    .optional(),
  removable: z.boolean().optional(),
  size: z.enum(["sm", "md"]).optional(),
});

const listNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("list"),
  ordered: z.boolean().optional(),
  gap: z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
  items: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      description: z.string().optional(),
      icon: z.string().optional(),
      tone: z
        .enum(["default", "muted", "primary", "success", "warning", "danger"])
        .optional(),
    }),
  ),
});

const quoteNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("quote"),
  text: z.string(),
  author: z.string().optional(),
  source: z.string().optional(),
  tone: z.enum(["default", "muted", "primary"]).optional(),
});

const cardNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("card"),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  image: z.string().optional(),
  footer: _uiArray.optional(),
  gap: z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
  children: _uiArray,
});

const descriptionListNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("description_list"),
  gap: z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
  layout: z.enum(["vertical", "horizontal"]).optional(),
  items: z.array(
    z.object({
      id: z.string(),
      term: z.string(),
      description: z.string(),
    }),
  ),
});

const emptyStateNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("empty_state"),
  icon: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  action: z
    .object({
      label: z.string(),
      intent: z.string(),
    })
    .optional(),
});

const gaugeNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("gauge"),
  title: z.string().optional(),
  value: z.number(),
  min: z.number(),
  max: z.number(),
  unit: z.string().optional(),
  thresholds: z
    .array(
      z.object({
        color: z.enum(["success", "warning", "danger"]),
        min: z.number(),
        max: z.number(),
        label: z.string().optional(),
      }),
    )
    .optional(),
  size: z.enum(["sm", "md", "lg"]).optional(),
});

const kpiCardNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("kpi_card"),
  title: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  trend: z.enum(["up", "down", "stable"]).optional(),
  trendValue: z.string().optional(),
  description: z.string().optional(),
  tone: z
    .enum(["default", "primary", "success", "warning", "danger"])
    .optional(),
});

const heatmapNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("heatmap"),
  title: z.string().optional(),
  xLabels: z.array(z.string()).optional(),
  yLabels: z.array(z.string()).optional(),
  data: z.array(z.array(z.number())),
  colorScale: z.enum(["blue", "green", "red", "yellow", "purple"]).optional(),
  cellSize: z.enum(["sm", "md", "lg"]).optional(),
});

const colorSwatchNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("color_swatch"),
  title: z.string().optional(),
  colors: z.array(
    z.object({
      value: z.string(),
      label: z.string().optional(),
    }),
  ),
  size: z.enum(["sm", "md", "lg"]).optional(),
});

const radarChartNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("radar_chart"),
  title: z.string().optional(),
  axes: z.array(z.string()),
  series: z.array(
    z.object({
      name: z.string(),
      values: z.array(z.number()),
      color: z.string().optional(),
    }),
  ),
  maxValue: z.number().optional(),
});

const statGroupNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("stat_group"),
  gap: z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  items: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.union([z.string(), z.number()]),
      unit: z.string().optional(),
      trend: z.enum(["up", "down", "stable"]).optional(),
      trendValue: z.string().optional(),
    }),
  ),
});

const stepsNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("steps"),
  current: z.number(),
  direction: z.enum(["horizontal", "vertical"]).optional(),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      status: z.enum(["wait", "process", "finish", "error"]).optional(),
    }),
  ),
});

const clockNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("clock"),
  format: z.enum(["time", "date", "datetime", "iso"]).optional(),
  timezone: z.string().optional(),
  interval: z.number().optional(),
  label: z.string().optional(),
  variant: z.enum(["default", "mono", "large"]).optional(),
});

const timerRefreshNodeSchema = z.object({
  ...baseNodeExtras,
  type: z.literal("timer_refresh"),
  seconds: z
    .number()
    .min(1)
    .max(300)
    .default(3)
    .describe("延迟秒数（1-300），默认 3 秒"),
  message: z.string().optional().describe("倒计时期间显示的提示消息"),
  showProgress: z.boolean().optional().describe("是否显示进度条"),
});

// -----------------------------------------------------------
// UINode — Discriminated Union of all node types
// -----------------------------------------------------------

export const uiNodeSchema = z.discriminatedUnion("type", [
  screenNodeSchema,
  containerNodeSchema,
  gridNodeSchema,
  splitNodeSchema,
  regionNodeSchema,
  toolbarNodeSchema,
  spacerNodeSchema,
  dividerNodeSchema,
  panelNodeSchema,
  headingNodeSchema,
  textNodeSchema,
  buttonNodeSchema,
  textInputNodeSchema,
  numberInputNodeSchema,
  textareaNodeSchema,
  selectNodeSchema,
  checkboxNodeSchema,
  sliderNodeSchema,
  stepperNodeSchema,
  externalLinkNodeSchema,
  localValueDisplayNodeSchema,
  tableNodeSchema,
  metricNodeSchema,
  alertNodeSchema,
  tabsNodeSchema,
  modalNodeSchema,
  drawerNodeSchema,
  codeBlockNodeSchema,
  chartBarNodeSchema,
  chartLineNodeSchema,
  imageNodeSchema,
  // v0.3.1 — Extended Nodes
  carouselNodeSchema,
  badgeNodeSchema,
  progressNodeSchema,
  statisticNodeSchema,
  timelineNodeSchema,
  accordionNodeSchema,
  breadcrumbNodeSchema,
  tagNodeSchema,
  listNodeSchema,
  quoteNodeSchema,
  cardNodeSchema,
  descriptionListNodeSchema,
  emptyStateNodeSchema,
  gaugeNodeSchema,
  kpiCardNodeSchema,
  heatmapNodeSchema,
  colorSwatchNodeSchema,
  radarChartNodeSchema,
  statGroupNodeSchema,
  stepsNodeSchema,
  clockNodeSchema,
  timerRefreshNodeSchema,
]);

// -----------------------------------------------------------
// Event Schemas
// -----------------------------------------------------------

export const localUIStateSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  dirtyBindings: z.array(z.string()),
  updatedAt: z.string(),
});

export const clientSnapshotSchema = z.object({
  localState: localUIStateSchema,
  currentVisibleBindings: z.record(z.string(), z.unknown()),
});

export const appSearchEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.string(),
  type: z.literal("app.search"),
  query: z.string(),
  refine: z.boolean().optional(),
  thinking: z.boolean().optional(),
  postProcess: z.boolean().optional(),
  refinedPrompt: z.string().optional(),
  refinedContext: z
    .object({
      appKind: z.string().optional(),
      appTitle: z.string().optional(),
      appDescription: z.string().optional(),
      keyFeatures: z.array(z.string()).optional(),
      suggestedLayout: z.string().optional(),
      suggestedComponents: z.array(z.string()).optional(),
    })
    .optional(),
});

export const componentClickEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.string(),
  type: z.literal("component.click"),
  target: z.object({
    id: z.string(),
    type: z.string(),
    label: z.string().optional(),
    intent: z.string().optional(),
    semanticRole: z.string().optional(),
    expectedEffect: z.string().optional(),
  }),
  payload: z.record(z.string(), z.unknown()).optional(),
  clientSnapshot: clientSnapshotSchema.optional(),
});

export const componentCommitEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.string(),
  type: z.literal("component.commit"),
  target: z.object({
    id: z.string(),
    type: z.string(),
    binding: z.string().optional(),
    semanticRole: z.string().optional(),
    expectedEffect: z.string().optional(),
  }),
  payload: z.object({
    committedBinding: z.string().optional(),
    previousValue: z.unknown().optional(),
    nextValue: z.unknown().optional(),
  }),
  clientSnapshot: clientSnapshotSchema,
});

export const formSubmitEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.string(),
  type: z.literal("form.submit"),
  target: z.object({ id: z.string() }),
  payload: z.object({ values: z.record(z.string(), z.unknown()) }),
  clientSnapshot: clientSnapshotSchema.optional(),
});

export const tabChangeEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.string(),
  type: z.literal("tabs.change"),
  target: z.object({ id: z.string() }),
  payload: z.object({
    previousTab: z.string().optional(),
    nextTab: z.string(),
  }),
  clientSnapshot: clientSnapshotSchema.optional(),
});

export const modalCloseEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.string(),
  type: z.literal("modal.close"),
  target: z.object({ id: z.string(), closeIntent: z.string().optional() }),
  clientSnapshot: clientSnapshotSchema.optional(),
});

export const runtimeCommandEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.string(),
  type: z.literal("runtime.command"),
  command: z.enum(["restart", "back_to_launcher", "inspect_state"]),
  clientSnapshot: clientSnapshotSchema.optional(),
});

export const timerRefreshEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.string(),
  type: z.literal("timer.refresh"),
  timerId: z.string(),
  appId: z.string().optional(),
  appTitle: z.string().optional(),
  appKind: z.string().optional(),
});

export const auirEventSchema = z.discriminatedUnion("type", [
  appSearchEventSchema,
  componentClickEventSchema,
  componentCommitEventSchema,
  formSubmitEventSchema,
  tabChangeEventSchema,
  modalCloseEventSchema,
  runtimeCommandEventSchema,
  timerRefreshEventSchema,
]);

// -----------------------------------------------------------
// Session / App Descriptor
// -----------------------------------------------------------

export const auirSessionSchema = z.object({
  sessionId: z.string(),
  appId: z.string().optional(),
  turn: z.number(),
  pageLogId: z.string().optional(),
  pageStartedAt: z.string().optional(),
  initialQuery: z.string().optional(),
});

export const auirAppDescriptorSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum([
    "launcher",
    "utility",
    "engineering_tool",
    "creative_tool",
    "productivity_tool",
    "simulation",
    "dashboard",
    "unknown",
  ]),
  description: z.string().optional(),
});

// -----------------------------------------------------------
// Memory Schemas
// -----------------------------------------------------------

export const retrievedUserMemorySchema = z.object({
  key: z.string(),
  value: z.unknown(),
  source: z.enum(["explicit", "inferred", "system"]),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().optional(),
  lastUsedAt: z.string().optional(),
  sensitivity: z.enum(["low", "medium", "high"]).optional(),
});

export const auirMemorySchema = z.object({
  turn: z.record(z.string(), z.unknown()),
  session: z.record(z.string(), z.unknown()),
  app: z.record(z.string(), z.unknown()),
  user: z.array(retrievedUserMemorySchema),
});

export const jsonPatchOperationSchema = z.object({
  op: z.enum(["add", "replace", "remove"]),
  path: z.string(),
  value: z.unknown().optional(),
});

export const userMemoryCandidateSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["explicit", "inferred"]),
  requiresUserConsent: z.boolean(),
});

export const auirMemoryPatchSchema = z.object({
  session: z.array(jsonPatchOperationSchema).optional(),
  app: z.array(jsonPatchOperationSchema).optional(),
  userCandidates: z.array(userMemoryCandidateSchema).optional(),
});

// -----------------------------------------------------------
// Tool Schemas
// -----------------------------------------------------------

export const auirToolDescriptorSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputTrustLevel: z.enum(["real", "simulated", "estimated"]),
  requiresUserConfirmation: z.boolean(),
});

export const auirToolRequestSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
  reason: z.string(),
  requiresUserConfirmation: z.boolean(),
});

// -----------------------------------------------------------
// Diagnostics Schema
// -----------------------------------------------------------

export const auirDiagnosticsSchema = z.object({
  eventInterpretedAs: z.string().optional(),
  stateTransition: z.string().optional(),
  simulatedData: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
  modelUsed: z.string().optional(),
  turnCount: z.number().optional(),
  nodeCount: z.number().optional(),
  errors: z.array(z.string()).optional(),
});

// -----------------------------------------------------------
// State Schema
// -----------------------------------------------------------

export const auirStateSchema = z.object({
  app: auirAppDescriptorSchema,
  memory: z.object({
    app: z.record(z.string(), z.unknown()),
    session: z.record(z.string(), z.unknown()),
  }),
  ui: uiNodeSchema,
});

// -----------------------------------------------------------
// Constraints Schema
// -----------------------------------------------------------

export const auirConstraintsSchema = z.object({
  renderMode: z.literal("full_state"),
  allowedComponents: z.array(z.string()),
  maxNodes: z.number(),
  maxDepth: z.number(),
  maxTextLength: z.number(),
  allowExternalData: z.boolean(),
  allowCodeExecution: z.boolean(),
  allowToolUse: z.boolean(),
  styleSystem: z.literal("semantic_tokens_only"),
  layoutPolicy: z.object({
    allowMultiColumn: z.boolean(),
    allowGrid: z.boolean(),
    allowSplitView: z.boolean(),
    maxGridColumns: z.number(),
    maxRegions: z.number(),
  }),
  interactionPolicy: z.object({
    defaultInputMode: z.enum(["local", "ai_transition"]),
    defaultButtonMode: z.enum(["ai_transition", "local"]),
    requireClientSnapshotForAITransition: z.boolean(),
    allowLocalActions: z.boolean(),
    allowDebouncedAITransitions: z.boolean(),
  }),
  transitionPolicy: z.object({
    preferMinimalChange: z.boolean(),
    preserveStableIds: z.boolean(),
    preserveUserInputs: z.boolean(),
    allowMajorRedesignOnlyOn: z.array(z.string()),
  }),
});

// -----------------------------------------------------------
// Top-Level Request / Response Schemas
// -----------------------------------------------------------

export const auirRequestSchema = z.object({
  protocol: z.literal("AUIR"),
  version: z.literal("0.3"),
  session: auirSessionSchema,
  previous: auirStateSchema.nullable(),
  event: auirEventSchema,
  memory: auirMemorySchema,
  constraints: auirConstraintsSchema,
  availableTools: z.array(auirToolDescriptorSchema).optional(),
});

export const auirResponseSchema = z.object({
  protocol: z.literal("AUIR"),
  version: z.literal("0.3"),
  next: auirStateSchema,
  memoryPatch: auirMemoryPatchSchema.optional(),
  toolRequests: z.array(auirToolRequestSchema).optional(),
  diagnostics: auirDiagnosticsSchema.optional(),
});

// Type exports derived from schemas
export type AUIRRequestValidated = z.infer<typeof auirRequestSchema>;
export type AUIRResponseValidated = z.infer<typeof auirResponseSchema>;
