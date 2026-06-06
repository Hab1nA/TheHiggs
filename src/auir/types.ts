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
  | ChartLineNode;

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
