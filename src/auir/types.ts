// ============================================================
// AUIR (AI User Interface Runtime) — 核心类型定义
// ============================================================
// 协议版本：0.3
// 本文件定义 AI-UI Co-Execution Runtime 的所有 TypeScript 类型。

// -----------------------------------------------------------
// 基础协议类型
// -----------------------------------------------------------

export type AUIRProtocol = "AUIR";
export type AUIRVersion = "0.3";

export type AUIRRequest = {
  protocol: AUIRProtocol;
  version: AUIRVersion;
  session: AUIRSession;
  previous: AUIRState | null;
  event: AUIREvent;
  memory: AUIRMemory;
  constraints: AUIRConstraints;
  availableTools?: AUIRToolDescriptor[];
};

export type AUIRResponse = {
  protocol: AUIRProtocol;
  version: AUIRVersion;
  next: AUIRState;
  memoryPatch?: AUIRMemoryPatch;
  toolRequests?: AUIRToolRequest[];
  diagnostics?: AUIRDiagnostics;
};

// -----------------------------------------------------------
// Session
// -----------------------------------------------------------

export type AUIRSession = {
  sessionId: string;
  appId?: string;
  turn: number;
};

// -----------------------------------------------------------
// State
// -----------------------------------------------------------

export type AUIRState = {
  app: AUIRAppDescriptor;
  memory: {
    app: Record<string, unknown>;
    session: Record<string, unknown>;
  };
  ui: UINode;
};

// -----------------------------------------------------------
// App Descriptor
// -----------------------------------------------------------

export type AppKind =
  | "launcher"
  | "utility"
  | "engineering_tool"
  | "creative_tool"
  | "productivity_tool"
  | "simulation"
  | "dashboard"
  | "unknown";

export type AUIRAppDescriptor = {
  id: string;
  title: string;
  kind: AppKind;
  description?: string;
};

// -----------------------------------------------------------
// UI Node 协议
// -----------------------------------------------------------

export type SemanticRole =
  | "navigation"
  | "input"
  | "analysis_action"
  | "local_adjustment"
  | "display"
  | "warning"
  | "confirmation"
  | "tool_result"
  | "simulation_result";

export type NodeLayoutHints = {
  width?: "auto" | "full" | "content" | "1/2" | "1/3" | "2/3" | "1/4" | "3/4";
  height?: "auto" | "full" | "content";
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  grow?: boolean;
  order?: number;
};

export type NodeStyleTokens = {
  tone?: "default" | "muted" | "primary" | "success" | "warning" | "danger";
  density?: "compact" | "normal" | "spacious";
  emphasis?: "low" | "medium" | "high";
};

export type InteractionMode = "local" | "ai_transition" | "hybrid";
export type CommitTrigger = "blur" | "enter" | "change" | "click" | "submit";

export type InteractionPolicy = {
  mode: InteractionMode;
  commitOn?: CommitTrigger[];
  includeLocalStateOnCommit?: boolean;
  debounceMs?: number;
};

export type LocalAction =
  | {
      type: "increment" | "decrement";
      binding: string;
      step?: number;
      min?: number;
      max?: number;
    }
  | {
      type: "set_value";
      binding: string;
      value: unknown;
    }
  | {
      type: "toggle";
      binding: string;
    };

// -----------------------------------------------------------
// Base Node
// -----------------------------------------------------------

export type BaseNode = {
  id: string;
  type: string;
  visible?: boolean;
  semanticRole?: SemanticRole;
  intent?: string;
  expectedEffect?: string;
  layout?: NodeLayoutHints;
  style?: NodeStyleTokens;
};

// -----------------------------------------------------------
// Layout Nodes
// -----------------------------------------------------------

export type ScreenNode = BaseNode & {
  type: "screen";
  title?: string;
  layoutMode?: "single" | "dashboard" | "workspace" | "document" | "wizard";
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  children: UINode[];
};

export type ContainerNode = BaseNode & {
  type: "container";
  direction?: "row" | "column" | "grid";
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  wrap?: boolean;
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  children: UINode[];
};

export type GridNode = BaseNode & {
  type: "grid";
  columns: 1 | 2 | 3 | 4 | 5 | 6 | "auto";
  gap?: "xs" | "sm" | "md" | "lg";
  children: UINode[];
};

export type SplitNode = BaseNode & {
  type: "split";
  orientation: "horizontal" | "vertical";
  ratio?: "1:1" | "1:2" | "2:1" | "1:3" | "3:1";
  primary: UINode;
  secondary: UINode;
};

export type RegionNode = BaseNode & {
  type: "region";
  region:
    | "header"
    | "sidebar"
    | "main"
    | "inspector"
    | "footer"
    | "toolbar"
    | "results"
    | "logs";
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  children: UINode[];
};

export type ToolbarNode = BaseNode & {
  type: "toolbar";
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  children: UINode[];
};

export type SpacerNode = BaseNode & {
  type: "spacer";
  size?: "xs" | "sm" | "md" | "lg";
};

export type DividerNode = BaseNode & {
  type: "divider";
  orientation?: "horizontal" | "vertical";
};

// -----------------------------------------------------------
// Composition Nodes
// -----------------------------------------------------------

export type PanelNode = BaseNode & {
  type: "panel";
  title?: string;
  subtitle?: string;
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  children: UINode[];
};

export type TabsNode = BaseNode & {
  type: "tabs";
  activeTab: string;
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  tabs: {
    id: string;
    label: string;
    children: UINode[];
  }[];
  interaction?: InteractionPolicy;
};

export type ModalNode = BaseNode & {
  type: "modal";
  title: string;
  children: UINode[];
  closeIntent: string;
};

export type DrawerNode = BaseNode & {
  type: "drawer";
  title: string;
  side: "left" | "right" | "bottom";
  children: UINode[];
  closeIntent: string;
};

// -----------------------------------------------------------
// Content Nodes
// -----------------------------------------------------------

export type HeadingNode = BaseNode & {
  type: "heading";
  text: string;
  level?: 1 | 2 | 3 | 4;
};

export type TextNode = BaseNode & {
  type: "text";
  text: string;
};

export type MetricNode = BaseNode & {
  type: "metric";
  label: string;
  value: string | number;
  unit?: string;
  confidence?: "real" | "simulated" | "estimated";
};

export type AlertNode = BaseNode & {
  type: "alert";
  title?: string;
  message: string;
  tone: "info" | "success" | "warning" | "danger";
};

export type CodeBlockNode = BaseNode & {
  type: "code_block";
  language?: string;
  code: string;
};

export type TableNode = BaseNode & {
  type: "table";
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
};

// -----------------------------------------------------------
// Input Nodes
// -----------------------------------------------------------

export type ButtonNode = BaseNode & {
  type: "button";
  label: string;
  intent: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  interaction?: InteractionPolicy;
  localAction?: LocalAction;
};

export type TextInputNode = BaseNode & {
  type: "text_input";
  label?: string;
  placeholder?: string;
  value?: string;
  binding: string;
  interaction?: InteractionPolicy;
};

export type NumberInputNode = BaseNode & {
  type: "number_input";
  label?: string;
  placeholder?: string;
  value?: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  binding: string;
  interaction?: InteractionPolicy;
};

export type TextareaNode = BaseNode & {
  type: "textarea";
  label?: string;
  placeholder?: string;
  value?: string;
  binding: string;
  interaction?: InteractionPolicy;
};

export type SelectNode = BaseNode & {
  type: "select";
  label?: string;
  value?: string;
  binding: string;
  options: { label: string; value: string }[];
  interaction?: InteractionPolicy;
};

export type CheckboxNode = BaseNode & {
  type: "checkbox";
  label: string;
  checked: boolean;
  binding: string;
  interaction?: InteractionPolicy;
};

export type SliderNode = BaseNode & {
  type: "slider";
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  binding: string;
  interaction?: InteractionPolicy;
};

export type StepperNode = BaseNode & {
  type: "stepper";
  label?: string;
  value: number;
  binding: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  interaction?: InteractionPolicy;
};

// -----------------------------------------------------------
// Runtime Nodes
// -----------------------------------------------------------

export type LocalValueDisplayNode = BaseNode & {
  type: "local_value_display";
  label?: string;
  binding: string;
  unit?: string;
  format?: "plain" | "fixed_1" | "fixed_2" | "scientific";
};

// -----------------------------------------------------------
// Chart Nodes
// -----------------------------------------------------------

export type ChartBarNode = BaseNode & {
  type: "chart_bar";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  data: { label: string; value: number }[];
};

export type ChartLineNode = BaseNode & {
  type: "chart_line";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  data: { x: string | number; y: number }[];
};

// -----------------------------------------------------------
// Extended Layout Nodes (v0.3.1)
// -----------------------------------------------------------

/** 轮播容器 — 水平可滚动卡片 */
export type CarouselNode = BaseNode & {
  type: "carousel";
  title?: string;
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  /** 每页可见项数 */
  visibleItems?: 1 | 2 | 3 | 4;
  children: UINode[];
};

// -----------------------------------------------------------
// Extended Content Nodes (v0.3.1)
// -----------------------------------------------------------

/** 徽标 — 紧凑的状态/数量指示器 */
export type BadgeNode = BaseNode & {
  type: "badge";
  text: string;
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md" | "lg";
};

/** 进度条 */
export type ProgressNode = BaseNode & {
  type: "progress";
  label?: string;
  value: number;
  max?: number;
  unit?: string;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
};

/** 增强统计卡 — 带趋势指示 */
export type StatisticNode = BaseNode & {
  type: "statistic";
  title: string;
  value: string | number;
  prefix?: string;
  suffix?: string;
  trend?: "up" | "down" | "stable";
  trendValue?: string;
  description?: string;
};

/** 时间线 */
export type TimelineNode = BaseNode & {
  type: "timeline";
  items: {
    id: string;
    title: string;
    description?: string;
    timestamp?: string;
    tone?: "default" | "primary" | "success" | "warning" | "danger";
    /** 自定义图标首字母（emoji 或单字） */
    icon?: string;
  }[];
};

/** 手风琴 — 可折叠面板组 */
export type AccordionNode = BaseNode & {
  type: "accordion";
  /** 默认展开的面板 index（从 0 开始）；-1 表示全部折叠 */
  defaultOpenIndex?: number;
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  items: {
    id: string;
    title: string;
    children: UINode[];
  }[];
};

/** 面包屑导航 */
export type BreadcrumbNode = BaseNode & {
  type: "breadcrumb";
  items: {
    label: string;
    href?: string;
  }[];
  separator?: "/" | ">" | "›";
};

/** 标签/标签组 */
export type TagNode = BaseNode & {
  type: "tag";
  text: string;
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "info";
  removable?: boolean;
  size?: "sm" | "md";
};

/** 列表 — 带可选图标的有序/无序列表 */
export type ListNode = BaseNode & {
  type: "list";
  ordered?: boolean;
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  items: {
    id: string;
    text: string;
    description?: string;
    icon?: string;
    tone?: "default" | "muted" | "primary" | "success" | "warning" | "danger";
  }[];
};

/** 引用块 */
export type QuoteNode = BaseNode & {
  type: "quote";
  text: string;
  author?: string;
  source?: string;
  tone?: "default" | "muted" | "primary";
};

/** 增强卡片 — 带分区的内容容器 */
export type CardNode = BaseNode & {
  type: "card";
  title?: string;
  subtitle?: string;
  /** 可选的顶部图片 URL 或占位描述 */
  image?: string;
  /** 可选的底部操作区 */
  footer?: UINode[];
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  children: UINode[];
};

/** 描述列表 — 键值对展示 */
export type DescriptionListNode = BaseNode & {
  type: "description_list";
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  layout?: "vertical" | "horizontal";
  items: {
    id: string;
    term: string;
    description: string;
  }[];
};

/** 空状态占位 */
export type EmptyStateNode = BaseNode & {
  type: "empty_state";
  icon?: string;
  title: string;
  description?: string;
  /** 可选的 CTA 按钮 */
  action?: {
    label: string;
    intent: string;
  };
};

/** 简易仪表盘 */
export type GaugeNode = BaseNode & {
  type: "gauge";
  title?: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  /** 阈值区间定义 */
  thresholds?: {
    color: "success" | "warning" | "danger";
    min: number;
    max: number;
    label?: string;
  }[];
  size?: "sm" | "md" | "lg";
};

/** KPI 卡片 — 大数值展示 + 趋势 */
export type KPICardNode = BaseNode & {
  type: "kpi_card";
  title: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "stable";
  trendValue?: string;
  description?: string;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
};

/** 简易热力图 */
export type HeatmapNode = BaseNode & {
  type: "heatmap";
  title?: string;
  xLabels?: string[];
  yLabels?: string[];
  /** 值范围 0-100 的二维网格 */
  data: number[][];
  /** 色阶 */
  colorScale?: "blue" | "green" | "red" | "yellow" | "purple";
  cellSize?: "sm" | "md" | "lg";
};

/** 颜色色板 */
export type ColorSwatchNode = BaseNode & {
  type: "color_swatch";
  title?: string;
  colors: {
    value: string;
    label?: string;
  }[];
  size?: "sm" | "md" | "lg";
};

/** 雷达图 — 多维度对比 */
export type RadarChartNode = BaseNode & {
  type: "radar_chart";
  title?: string;
  /** 维度标签 */
  axes: string[];
  /** 多组数据 */
  series: {
    name: string;
    values: number[];
    color?: string;
  }[];
  maxValue?: number;
};

/** 键值统计组 — 多个 metric 的紧凑排列 */
export type StatGroupNode = BaseNode & {
  type: "stat_group";
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  columns?: 2 | 3 | 4;
  items: {
    id: string;
    label: string;
    value: string | number;
    unit?: string;
    trend?: "up" | "down" | "stable";
    trendValue?: string;
  }[];
};

/** 步骤条 — 流程/向导进度指示 */
export type StepsNode = BaseNode & {
  type: "steps";
  current: number;
  direction?: "horizontal" | "vertical";
  items: {
    id: string;
    title: string;
    description?: string;
    status?: "wait" | "process" | "finish" | "error";
  }[];
};

// -----------------------------------------------------------
// UINode Union
// -----------------------------------------------------------

export type UINode =
  | ScreenNode
  | ContainerNode
  | GridNode
  | SplitNode
  | RegionNode
  | ToolbarNode
  | SpacerNode
  | DividerNode
  | PanelNode
  | HeadingNode
  | TextNode
  | ButtonNode
  | TextInputNode
  | NumberInputNode
  | TextareaNode
  | SelectNode
  | CheckboxNode
  | SliderNode
  | StepperNode
  | LocalValueDisplayNode
  | TableNode
  | MetricNode
  | AlertNode
  | TabsNode
  | ModalNode
  | DrawerNode
  | CodeBlockNode
  | ChartBarNode
  | ChartLineNode
  // v0.3.1 — Extended Nodes
  | CarouselNode
  | BadgeNode
  | ProgressNode
  | StatisticNode
  | TimelineNode
  | AccordionNode
  | BreadcrumbNode
  | TagNode
  | ListNode
  | QuoteNode
  | CardNode
  | DescriptionListNode
  | EmptyStateNode
  | GaugeNode
  | KPICardNode
  | HeatmapNode
  | ColorSwatchNode
  | RadarChartNode
  | StatGroupNode
  | StepsNode;

// -----------------------------------------------------------
// Event 协议
// -----------------------------------------------------------

export type LocalUIState = {
  values: Record<string, unknown>;
  dirtyBindings: string[];
  updatedAt: string;
};

export type ClientSnapshot = {
  localState: LocalUIState;
  currentVisibleBindings: Record<string, unknown>;
};

export type EventTarget =
  | {
      id: string;
      type: string;
      label?: string;
      intent?: string;
      semanticRole?: string;
      expectedEffect?: string;
      binding?: string;
    }
  | {
      id: string;
      closeIntent?: string;
    };

export type AppSearchEvent = {
  eventId: string;
  timestamp: string;
  type: "app.search";
  query: string;
  /** 是否启用 AI Prompt Refine Mode（先细化再生成） */
  refine?: boolean;
  /** 是否启用 DeepSeek Thinking Mode（思维链推理） */
  thinking?: boolean;
  /** AI 细化后的详细提示词（由 refine 步骤填入） */
  refinedPrompt?: string;
  /** 细化结果的补充上下文 */
  refinedContext?: {
    appKind?: string;
    appTitle?: string;
    appDescription?: string;
    keyFeatures?: string[];
    suggestedLayout?: string;
    suggestedComponents?: string[];
  };
};

export type ComponentClickEvent = {
  eventId: string;
  timestamp: string;
  type: "component.click";
  target: {
    id: string;
    type: string;
    label?: string;
    intent?: string;
    semanticRole?: string;
    expectedEffect?: string;
  };
  payload?: Record<string, unknown>;
  clientSnapshot?: ClientSnapshot;
};

export type ComponentCommitEvent = {
  eventId: string;
  timestamp: string;
  type: "component.commit";
  target: {
    id: string;
    type: string;
    binding?: string;
    semanticRole?: string;
    expectedEffect?: string;
  };
  payload: {
    committedBinding?: string;
    previousValue?: unknown;
    nextValue?: unknown;
  };
  clientSnapshot: ClientSnapshot;
};

export type FormSubmitEvent = {
  eventId: string;
  timestamp: string;
  type: "form.submit";
  target: { id: string };
  payload: { values: Record<string, unknown> };
  clientSnapshot?: ClientSnapshot;
};

export type TabChangeEvent = {
  eventId: string;
  timestamp: string;
  type: "tabs.change";
  target: { id: string };
  payload: { previousTab?: string; nextTab: string };
  clientSnapshot?: ClientSnapshot;
};

export type ModalCloseEvent = {
  eventId: string;
  timestamp: string;
  type: "modal.close";
  target: { id: string; closeIntent?: string };
  clientSnapshot?: ClientSnapshot;
};

export type RuntimeCommandEvent = {
  eventId: string;
  timestamp: string;
  type: "runtime.command";
  command: "restart" | "back_to_launcher" | "inspect_state";
  clientSnapshot?: ClientSnapshot;
};

export type AUIREvent =
  | AppSearchEvent
  | ComponentClickEvent
  | ComponentCommitEvent
  | FormSubmitEvent
  | TabChangeEvent
  | ModalCloseEvent
  | RuntimeCommandEvent;

// -----------------------------------------------------------
// Memory 系统
// -----------------------------------------------------------

export type RetrievedUserMemory = {
  key: string;
  value: unknown;
  source: "explicit" | "inferred" | "system";
  confidence: number;
  createdAt?: string;
  lastUsedAt?: string;
  sensitivity?: "low" | "medium" | "high";
};

export type AUIRMemory = {
  turn: Record<string, unknown>;
  session: Record<string, unknown>;
  app: Record<string, unknown>;
  user: RetrievedUserMemory[];
};

export type JsonPatchOperation = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};

export type UserMemoryCandidate = {
  key: string;
  value: unknown;
  reason: string;
  confidence: number;
  source: "explicit" | "inferred";
  requiresUserConsent: boolean;
};

export type AUIRMemoryPatch = {
  session?: JsonPatchOperation[];
  app?: JsonPatchOperation[];
  userCandidates?: UserMemoryCandidate[];
};

// -----------------------------------------------------------
// Tools
// -----------------------------------------------------------

export type AUIRToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputTrustLevel: "real" | "simulated" | "estimated";
  requiresUserConfirmation: boolean;
};

export type AUIRToolRequest = {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
  requiresUserConfirmation: boolean;
};

// -----------------------------------------------------------
// Diagnostics
// -----------------------------------------------------------

export type AUIRDiagnostics = {
  eventInterpretedAs?: string;
  stateTransition?: string;
  simulatedData?: boolean;
  warnings?: string[];
  modelUsed?: string;
  turnCount?: number;
  nodeCount?: number;
  errors?: string[];
};

// -----------------------------------------------------------
// Constraints
// -----------------------------------------------------------

export type LayoutPolicy = {
  allowMultiColumn: boolean;
  allowGrid: boolean;
  allowSplitView: boolean;
  maxGridColumns: number;
  maxRegions: number;
};

export type AUIRInteractionPolicy = {
  defaultInputMode: "local" | "ai_transition";
  defaultButtonMode: "ai_transition" | "local";
  requireClientSnapshotForAITransition: boolean;
  allowLocalActions: boolean;
  allowDebouncedAITransitions: boolean;
};

export type TransitionPolicy = {
  preferMinimalChange: boolean;
  preserveStableIds: boolean;
  preserveUserInputs: boolean;
  allowMajorRedesignOnlyOn: string[];
};

export type AUIRConstraints = {
  renderMode: "full_state";
  allowedComponents: string[];
  maxNodes: number;
  maxDepth: number;
  maxTextLength: number;
  allowExternalData: boolean;
  allowCodeExecution: boolean;
  allowToolUse: boolean;
  styleSystem: "semantic_tokens_only";
  layoutPolicy: LayoutPolicy;
  interactionPolicy: AUIRInteractionPolicy;
  transitionPolicy: TransitionPolicy;
};
