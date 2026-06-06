// ============================================================
// AUIR TypeScript Types — AI User Interface Runtime
// ============================================================

// --- Session ---
export type AUIRSession = {
  sessionId: string;
  appId?: string;
  turn: number;
};

// --- App Descriptor ---
export type AUIRAppDescriptor = {
  id: string;
  title: string;
  kind:
    | "launcher"
    | "utility"
    | "engineering_tool"
    | "creative_tool"
    | "productivity_tool"
    | "simulation"
    | "dashboard"
    | "unknown";
  description?: string;
};

// --- Base Node ---
export type BaseNode = {
  id: string;
  type: string;
  visible?: boolean;
};

// --- UI Nodes ---
export type ScreenNode = BaseNode & {
  type: "screen";
  title?: string;
  children: UINode[];
};

export type ContainerNode = BaseNode & {
  type: "container";
  direction?: "row" | "column" | "grid";
  gap?: "xs" | "sm" | "md" | "lg";
  children: UINode[];
};

export type PanelNode = BaseNode & {
  type: "panel";
  title?: string;
  children: UINode[];
};

export type HeadingNode = BaseNode & {
  type: "heading";
  text: string;
  level?: 1 | 2 | 3 | 4;
};

export type TextNode = BaseNode & {
  type: "text";
  text: string;
  tone?: "default" | "muted" | "success" | "warning" | "danger";
};

export type ButtonNode = BaseNode & {
  type: "button";
  label: string;
  intent: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export type TextInputNode = BaseNode & {
  type: "text_input";
  label?: string;
  placeholder?: string;
  value?: string;
  binding: string;
};

export type NumberInputNode = BaseNode & {
  type: "number_input";
  label?: string;
  placeholder?: string;
  value?: number;
  unit?: string;
  binding: string;
};

export type TextareaNode = BaseNode & {
  type: "textarea";
  label?: string;
  placeholder?: string;
  value?: string;
  binding: string;
};

export type SelectNode = BaseNode & {
  type: "select";
  label?: string;
  value?: string;
  binding: string;
  options: { label: string; value: string }[];
};

export type CheckboxNode = BaseNode & {
  type: "checkbox";
  label: string;
  checked: boolean;
  binding: string;
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
};

export type TableNode = BaseNode & {
  type: "table";
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
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

export type TabsNode = BaseNode & {
  type: "tabs";
  activeTab: string;
  tabs: { id: string; label: string; children: UINode[] }[];
};

export type ModalNode = BaseNode & {
  type: "modal";
  title: string;
  children: UINode[];
  closeIntent: string;
};

export type CodeBlockNode = BaseNode & {
  type: "code_block";
  language?: string;
  code: string;
};

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

// --- UINode Union ---
export type UINode =
  | ScreenNode
  | ContainerNode
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
  | TableNode
  | MetricNode
  | AlertNode
  | TabsNode
  | ModalNode
  | CodeBlockNode
  | ChartBarNode
  | ChartLineNode;

// --- State ---
export type AUIRState = {
  app: AUIRAppDescriptor;
  memory: {
    app: Record<string, unknown>;
    session: Record<string, unknown>;
  };
  ui: UINode;
};

// --- Memory ---
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

// --- Memory Patch ---
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

// --- Constraints ---
export type AUIRConstraints = {
  renderMode: "full_state";
  allowedComponents: string[];
  maxNodes: number;
  maxDepth: number;
  maxTextLength: number;
  allowExternalData: boolean;
  allowCodeExecution: boolean;
  styleSystem: "semantic_tokens_only";
  transitionPolicy: {
    preferMinimalChange: boolean;
    preserveStableIds: boolean;
    preserveUserInputs: boolean;
    allowMajorRedesignOnlyOn: string[];
  };
};

// --- Diagnostics ---
export type AUIRDiagnostics = {
  eventInterpretedAs?: string;
  stateTransition?: string;
  simulatedData?: boolean;
  warnings?: string[];
};

// --- Events ---
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
  };
  payload?: Record<string, unknown>;
};

export type ComponentValueChangeEvent = {
  eventId: string;
  timestamp: string;
  type: "component.value_change";
  target: {
    id: string;
    type: string;
    binding?: string;
  };
  payload: {
    previousValue?: unknown;
    nextValue: unknown;
  };
};

export type FormSubmitEvent = {
  eventId: string;
  timestamp: string;
  type: "form.submit";
  target: { id: string };
  payload: { values: Record<string, unknown> };
};

export type TabChangeEvent = {
  eventId: string;
  timestamp: string;
  type: "tabs.change";
  target: { id: string };
  payload: { previousTab?: string; nextTab: string };
};

export type ModalCloseEvent = {
  eventId: string;
  timestamp: string;
  type: "modal.close";
  target: {
    id: string;
    closeIntent?: string;
  };
};

export type AUIREvent =
  | AppSearchEvent
  | ComponentClickEvent
  | ComponentValueChangeEvent
  | FormSubmitEvent
  | TabChangeEvent
  | ModalCloseEvent;

// --- Request / Response ---
export type AUIRRequest = {
  protocol: "AUIR";
  version: "0.1";
  session: AUIRSession;
  previous: AUIRState | null;
  event: AUIREvent;
  memory: AUIRMemory;
  constraints: AUIRConstraints;
};

export type AUIRResponse = {
  protocol: "AUIR";
  version: "0.1";
  next: AUIRState;
  memoryPatch?: AUIRMemoryPatch;
  diagnostics?: AUIRDiagnostics;
};
