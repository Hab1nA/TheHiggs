# 技术文档：AI-UI Co-Execution Runtime Demo

> 面向 coding agent 的工程实现提示词。  
> 目标：基于 Vercel AI SDK、CopilotKit、Zod、React/Next.js 等现成工具，实现一个“AI 与其生成的 UI 合体成为应用本体”的技术演示工程。  
> 本文档替代“从零自研全部 AI UI runtime”的路线，优先复用成熟 SDK，减少造轮子。

---

## 0. 一句话定义

本项目不是“自然语言生成 UI”的工具，而是一个：

```text
AI-UI Co-Execution Runtime
```

也就是：

```text
AI 驻留在自己生成的 UI 中；
UI 是 AI 的交互表面；
用户事件是 AI 状态转移的输入；
应用本体存在于 AI、生成式 UI、事件协议、记忆系统的连续循环之中。
```

形式化表达：

```text
App = LLM Agent + Generated Semantic UI + Event Protocol + Memory + Tool Runtime
```

传统软件：

```text
Static Code + Backend Logic + Frontend View
```

本项目：

```text
LLM Semantic Reducer + Generated UI State + Structured Events + Runtime Memory
```

---

## 1. 项目目标

实现一个类似 VibeOS 思路的技术演示 App，但不要从零实现所有基础设施。优先使用现有工具：

```text
Vercel AI SDK：
  - 负责模型调用
  - 负责 structured output
  - 负责 streaming
  - 负责 tool calling
  - 负责 provider abstraction

CopilotKit：
  - 负责 agentic frontend primitives
  - 可选负责 chat / side panel
  - 可选负责 generative UI bridge
  - 可选负责 shared state / human-in-the-loop / AG-UI 风格集成

Zod：
  - 负责 schema 定义
  - 负责 AI 输出校验
  - 负责事件、UI AST、memory patch 的运行时约束

React / Next.js：
  - 负责前端宿主
  - 负责 UI 渲染器
  - 负责 API route
  - 负责开发与部署
```

用户打开应用后，首先看到一个“App Launcher”搜索框。用户输入想要的应用或工具，例如：

```text
做一个火箭发动机循环参数分析工具
```

系统不会生成可执行代码，不会生成 HTML/JSX 字符串，也不会动态执行 AI 生成的脚本。AI 只能生成一套受限的、结构化的语义 UI 状态。前端把该 UI 状态渲染成真实 React UI。

用户与 AI 生成的 UI 交互时，前端将点击、输入、提交、tab 切换等行为转化为结构化事件，再发送给 AI runtime。AI 根据：

```text
previous UI state
current event
session memory
app memory
retrieved user memory
available tools
runtime constraints
```

生成下一版 UI state、memory patch 和 diagnostics。

最终形成循环：

```text
User Intent / User Event
  ↓
Frontend captures structured event
  ↓
Runtime builds context from previous UI + memory + event
  ↓
Vercel AI SDK calls LLM with Zod-constrained output
  ↓
LLM returns next semantic UI state + memory patch
  ↓
Runtime validates output
  ↓
Frontend renders the next UI
  ↓
Repeat
```

---

## 2. 核心定位：不是 Prompt-to-UI，而是 AI-UI 共执行

必须在 README 和代码注释中明确区分：

```text
不是：
  User prompt -> AI generates a one-shot UI page

而是：
  AI generates UI -> user interacts -> AI interprets event -> AI updates app state -> AI generates next UI
```

UI 不是一次性产物，而是 AI 为自己构造的交互空间。每个 UI 节点都应该携带语义字段，例如：

```json
{
  "type": "button",
  "id": "compare_cycles",
  "label": "Compare Cycles",
  "intent": "compare_cycle_options",
  "semanticRole": "analysis_action",
  "expectedEffect": "generate a comparative analysis of engine cycle choices"
}
```

用户点击该按钮时，前端发送的不是原始 DOM click，而是：

```json
{
  "type": "component.click",
  "target": {
    "id": "compare_cycles",
    "type": "button",
    "label": "Compare Cycles",
    "intent": "compare_cycle_options",
    "semanticRole": "analysis_action"
  }
}
```

这表示：

```text
用户通过 AI 自己生成的语义触点表达了一个意图。
```

---

## 3. 推荐技术栈

请使用以下技术栈实现 MVP：

```text
Next.js App Router
TypeScript
React
Tailwind CSS
Zod
Vercel AI SDK
CopilotKit
OpenAI / Anthropic / Google / xAI / compatible providers through AI SDK
```

推荐安装：

```bash
npm install ai zod @ai-sdk/openai
npm install @copilotkit/react-core @copilotkit/react-ui
```

可选：

```bash
npm install @copilotkit/runtime
npm install react-markdown
npm install recharts
```

若项目使用 pnpm：

```bash
pnpm add ai zod @ai-sdk/openai
pnpm add @copilotkit/react-core @copilotkit/react-ui
```

环境变量：

```env
OPENAI_API_KEY=...
AI_MODEL=gpt-4.1
USE_MOCK_AI=false
```

必须提供 mock runtime。没有 API key 时，工程仍可运行。

---

## 4. 工具选型原则

### 4.1 Vercel AI SDK 的职责

使用 Vercel AI SDK 处理模型层，不要手写底层 fetch 调 OpenAI API。

Vercel AI SDK 在本项目中负责：

```text
1. generateObject / streamObject 风格的结构化输出
2. Zod schema 约束
3. provider abstraction
4. tool calling
5. streaming response
6. retry / repair 的外层封装
```

推荐优先使用：

```ts
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
```

目标是让模型直接返回 `AUIRResponse` 对象，而不是返回 Markdown 或字符串 JSON。

### 4.2 CopilotKit 的职责

CopilotKit 不应该取代 AUIR 协议，而应作为 agentic frontend 工具层使用。

可选使用方式：

```text
1. 用 CopilotKit 提供调试用 side panel / chat surface。
2. 用 CopilotKit shared state 暴露当前 AUIR state。
3. 用 useCopilotAction 注册安全 frontend actions。
4. 后期接入 AG-UI / CopilotKit agent runtime。
5. 用 CopilotKit 的 Generative UI 思路作为参考，但第一版仍以 AUIR JSON state 为核心。
```

第一版不要把整个系统绑死在 CopilotKit 的 chat 模式里。因为本项目的核心体验不是聊天，而是：

```text
用户使用 AI 自生成的应用界面。
```

CopilotKit 可以作为辅助控制面板、调试层、人机协作层，而不是唯一交互入口。

### 4.3 自研 AUIR 的职责

继续保留 AUIR，但它只负责项目的核心协议，不要自研已有 SDK 已经解决的问题。

AUIR 负责：

```text
1. UI AST
2. Event AST
3. Runtime memory shape
4. Memory patch
5. Runtime constraints
6. Diagnostics
7. Safety policy
```

Vercel AI SDK 负责模型调用。  
CopilotKit 负责 agentic frontend integration。  
AUIR 负责这个项目独有的“AI-UI 共执行协议”。

---

## 5. 推荐工程结构

请按以下结构组织工程：

```text
vibe-ui-runtime/
  app/
    layout.tsx
    page.tsx
    api/
      ai-ui/
        route.ts
      copilotkit/
        route.ts              # 可选：CopilotKit runtime endpoint

  src/
    auir/
      types.ts
      schema.ts
      prompt.ts
      constraints.ts
      memory.ts
      validate.ts
      fallback.ts
      examples.ts

    ai/
      model.ts
      runtime.ts
      generateNextState.ts
      tools.ts
      mockRuntime.ts

    runtime/
      Renderer.tsx
      event.ts
      client.ts
      state.ts
      bindings.ts

    copilot/
      CopilotProvider.tsx
      actions.ts
      readableState.ts

    components/
      Shell.tsx
      SearchLauncher.tsx
      LoadingOverlay.tsx
      ErrorPanel.tsx
      DebugPanel.tsx
      AUIRInspector.tsx

  .env.example
  package.json
  README.md
```

如果不做 CopilotKit，可暂时省略 `src/copilot` 和 `app/api/copilotkit`。但文档和架构应为后续接入保留位置。

---

## 6. AUIR 协议总览

AUIR 表示：

```text
AI User Interface Runtime
```

AUIR 由四部分组成：

```text
1. UI Description Language
   描述当前界面。

2. UI Event Language
   描述用户通过 AI 生成界面表达的操作与意图。

3. UI Memory Language
   描述当前 session、app、user 的记忆。

4. Runtime Control Language
   描述安全约束、组件白名单、渲染模式、工具权限。
```

每次 AI 状态转移使用：

```text
AUIRRequest -> AUIRResponse
```

---

## 7. TypeScript 类型设计

请在 `src/auir/types.ts` 中定义核心类型。

### 7.1 AUIRRequest

```ts
export type AUIRRequest = {
  protocol: "AUIR";
  version: "0.2";
  session: AUIRSession;
  previous: AUIRState | null;
  event: AUIREvent;
  memory: AUIRMemory;
  constraints: AUIRConstraints;
  availableTools?: AUIRToolDescriptor[];
};
```

### 7.2 AUIRResponse

```ts
export type AUIRResponse = {
  protocol: "AUIR";
  version: "0.2";
  next: AUIRState;
  memoryPatch?: AUIRMemoryPatch;
  toolRequests?: AUIRToolRequest[];
  diagnostics?: AUIRDiagnostics;
};
```

第一版允许 `toolRequests` 存在，但不必真正执行复杂工具。后续可以接 Vercel AI SDK tools。

### 7.3 Session

```ts
export type AUIRSession = {
  sessionId: string;
  appId?: string;
  turn: number;
};
```

### 7.4 State

```ts
export type AUIRState = {
  app: AUIRAppDescriptor;
  memory: {
    app: Record<string, unknown>;
    session: Record<string, unknown>;
  };
  ui: UINode;
};
```

### 7.5 App Descriptor

```ts
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
```

---

## 8. UI 节点协议：支持 AI 自主排版与语义交互

前端禁止执行 AI 生成的代码。AI 只能返回受限 UI AST。

本项目的 UI 不应被限制为单列聊天式界面。AI 应该可以在协议允许范围内，自主决定界面布局，例如：

```text
左右分栏
上下分区
多列 dashboard
grid 参数面板
主工作区 + 右侧 inspector
顶部 toolbar + 中央 canvas/panel + 底部 log
多 tab 工作台
modal / drawer / split view
```

但 AI 只能使用协议提供的布局语义，不能生成任意 CSS、HTML、JSX 或脚本。

支持节点分为五类：

```text
layout:
  screen
  container
  grid
  split
  region
  toolbar
  spacer
  divider

composition:
  panel
  tabs
  modal
  drawer

content:
  heading
  text
  table
  metric
  alert
  code_block
  chart_bar
  chart_line

input:
  button
  text_input
  number_input
  textarea
  select
  checkbox
  slider
  stepper

runtime:
  local_value_display
```

第一版不支持：

```text
html
iframe
script
raw_js
raw_css
arbitrary_react_component
terminal_exec
browser_exec
file_access
```

### 8.1 Base Node

所有节点必须有稳定 `id`。所有交互节点应尽可能携带 `semanticRole`、`intent`、`expectedEffect` 和交互策略。

```ts
export type BaseNode = {
  id: string;
  type: string;
  visible?: boolean;

  semanticRole?:
    | "navigation"
    | "input"
    | "analysis_action"
    | "local_adjustment"
    | "display"
    | "warning"
    | "confirmation"
    | "tool_result"
    | "simulation_result";

  expectedEffect?: string;

  layout?: NodeLayoutHints;
  style?: NodeStyleTokens;
};
```

布局和样式只能使用语义 token：

```ts
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
```

### 8.2 交互策略：local vs ai_transition

UI 节点必须区分两类交互：

```text
local interaction:
  用户操作只改变前端本地 draft state，不立即请求 AI。
  适合输入框、slider、加减按钮、checkbox、select、参数微调。

ai_transition interaction:
  用户操作会构造 AUIREvent，并请求 AI 生成下一版 UI。
  适合 Calculate、Analyze、Compare、Generate、Next、Submit、Apply 等语义动作。
```

协议字段：

```ts
export type InteractionPolicy = {
  mode: "local" | "ai_transition" | "hybrid";
  commitOn?: Array<"blur" | "enter" | "change" | "click" | "submit">;
  includeLocalStateOnCommit?: boolean;
  debounceMs?: number;
};
```

默认规则：

```text
text_input / number_input / textarea / slider / checkbox / select:
  默认 mode = "local"。
  只更新 frontend localState，不立即刷新 AI UI。

button:
  默认 mode = "ai_transition"。
  点击后把当前 localState snapshot 一并发给 AI。

stepper:
  默认 mode = "local"。
  点击 +/- 只更新绑定值和局部显示，不请求 AI。
```

这点是核心要求：用户可以连续调参数，页面局部即时更新；只有点击“计算 / 分析 / 应用 / 生成”等按钮时，才把所有本地参数一次性提交给 AI。

### 8.3 Screen Node

```ts
export type ScreenNode = BaseNode & {
  type: "screen";
  title?: string;
  layoutMode?: "single" | "dashboard" | "workspace" | "document" | "wizard";
  children: UINode[];
};
```

### 8.4 Container Node

通用布局容器。AI 可以用它定义 row、column 或 grid，但不能传任意 CSS。

```ts
export type ContainerNode = BaseNode & {
  type: "container";
  direction?: "row" | "column" | "grid";
  gap?: "none" | "xs" | "sm" | "md" | "lg";
  wrap?: boolean;
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  children: UINode[];
};
```

### 8.5 Grid Node

适合 dashboard 和参数面板。

```ts
export type GridNode = BaseNode & {
  type: "grid";
  columns: 1 | 2 | 3 | 4 | 5 | 6 | "auto";
  gap?: "xs" | "sm" | "md" | "lg";
  children: UINode[];
};
```

### 8.6 Split Node

适合主工作区 + 侧边栏。

```ts
export type SplitNode = BaseNode & {
  type: "split";
  orientation: "horizontal" | "vertical";
  ratio?: "1:1" | "1:2" | "2:1" | "1:3" | "3:1";
  primary: UINode;
  secondary: UINode;
};
```

### 8.7 Region Node

用于声明语义区域，方便 AI 组织复杂界面。

```ts
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
  children: UINode[];
};
```

### 8.8 Toolbar / Spacer / Divider

```ts
export type ToolbarNode = BaseNode & {
  type: "toolbar";
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
```

### 8.9 Panel Node

```ts
export type PanelNode = BaseNode & {
  type: "panel";
  title?: string;
  subtitle?: string;
  children: UINode[];
};
```

### 8.10 Text Nodes

```ts
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
```

### 8.11 Button Node

按钮分为本地按钮和 AI transition 按钮。

```ts
export type ButtonNode = BaseNode & {
  type: "button";
  label: string;
  intent: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  interaction?: InteractionPolicy;

  localAction?:
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
};
```

示例：本地加减按钮不刷新 AI：

```json
{
  "id": "pc_plus",
  "type": "button",
  "label": "+",
  "intent": "increase_chamber_pressure_locally",
  "semanticRole": "local_adjustment",
  "interaction": { "mode": "local", "commitOn": ["click"] },
  "localAction": {
    "type": "increment",
    "binding": "app.inputs.chamberPressureMPa",
    "step": 0.5,
    "min": 1,
    "max": 50
  }
}
```

示例：计算按钮会刷新 AI，并携带当前所有本地输入值：

```json
{
  "id": "calculate_performance",
  "type": "button",
  "label": "Calculate Performance",
  "intent": "calculate_engine_performance",
  "semanticRole": "analysis_action",
  "expectedEffect": "use current local input values to generate performance estimates and update result panels",
  "interaction": {
    "mode": "ai_transition",
    "commitOn": ["click"],
    "includeLocalStateOnCommit": true
  }
}
```

### 8.12 Input Nodes

输入节点默认只改变 localState，不立即请求 AI。

```ts
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
```

### 8.13 Stepper Node

专门用于参数加减，默认本地更新。

```ts
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
```

### 8.14 Local Value Display

用于显示本地 draft 值，不依赖 AI 刷新。

```ts
export type LocalValueDisplayNode = BaseNode & {
  type: "local_value_display";
  label?: string;
  binding: string;
  unit?: string;
  format?: "plain" | "fixed_1" | "fixed_2" | "scientific";
};
```

例如 chamber pressure slider 改变后，`local_value_display` 立即显示新值，但不请求模型。

### 8.15 Display Nodes

```ts
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

export type CodeBlockNode = BaseNode & {
  type: "code_block";
  language?: string;
  code: string;
};
```

### 8.16 Composition Nodes

```ts
export type TabsNode = BaseNode & {
  type: "tabs";
  activeTab: string;
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
```

### 8.17 Chart Nodes

```ts
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
```

### 8.18 UINode Union

```ts
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
```

---

## 9. UI 事件协议：区分本地交互事件与 AI 状态转移事件

前端不要发送原始 DOM 事件。必须发送结构化语义事件。

同时，协议必须区分：

```text
local-only event:
  只在前端本地处理，不发送给 AI。

ai-transition event:
  发送给 AI，请求生成下一版 UI。
  事件中必须包含当前 localState snapshot，使 AI 能读取那些未触发刷新的输入值。
```

### 9.1 Local UI State Snapshot

前端需要维护本地草稿状态：

```ts
export type LocalUIState = {
  values: Record<string, unknown>;
  dirtyBindings: string[];
  updatedAt: string;
};
```

其中 `values` 的 key 是 UI 节点的 `binding`，例如：

```json
{
  "app.inputs.chamberPressureMPa": 15,
  "app.inputs.mixtureRatio": 5.8,
  "app.inputs.expansionRatio": 80,
  "app.inputs.cycleType": "staged_combustion"
}
```

当用户点击 `Calculate` 这类 AI transition 按钮时，前端发送事件时必须附带：

```ts
export type ClientSnapshot = {
  localState: LocalUIState;
  currentVisibleBindings: Record<string, unknown>;
};
```

### 9.2 AUIREvent Union

```ts
export type AUIREvent =
  | AppSearchEvent
  | ComponentClickEvent
  | ComponentCommitEvent
  | FormSubmitEvent
  | TabChangeEvent
  | ModalCloseEvent
  | RuntimeCommandEvent;
```

注意：`component.value_change` 默认不再作为每次输入都发送给 AI 的事件。输入变化应首先更新前端 localState。只有在 blur/enter/submit/calculate 等 commit 时，才发送 `component.commit` 或其他 ai-transition 事件。

### 9.3 App Search Event

```ts
export type AppSearchEvent = {
  eventId: string;
  timestamp: string;
  type: "app.search";
  query: string;
};
```

### 9.4 Component Click Event

用于 AI transition 按钮，例如 Calculate、Analyze、Compare、Generate、Apply。

```ts
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
```

如果按钮的 `interaction.includeLocalStateOnCommit = true`，前端必须附带 `clientSnapshot`。

### 9.5 Component Commit Event

用于某些输入控件显式 commit，例如用户在输入框按 Enter，或者某个 select 配置为 change 即提交。

```ts
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
```

### 9.6 Form Submit Event

```ts
export type FormSubmitEvent = {
  eventId: string;
  timestamp: string;
  type: "form.submit";
  target: {
    id: string;
  };
  payload: {
    values: Record<string, unknown>;
  };
  clientSnapshot?: ClientSnapshot;
};
```

### 9.7 Tab Change Event

Tab 切换默认可以是本地交互。只有 tab 节点声明 `interaction.mode = "ai_transition"` 时才发送给 AI。

```ts
export type TabChangeEvent = {
  eventId: string;
  timestamp: string;
  type: "tabs.change";
  target: {
    id: string;
  };
  payload: {
    previousTab?: string;
    nextTab: string;
  };
  clientSnapshot?: ClientSnapshot;
};
```

### 9.8 Modal Close Event

```ts
export type ModalCloseEvent = {
  eventId: string;
  timestamp: string;
  type: "modal.close";
  target: {
    id: string;
    closeIntent?: string;
  };
  clientSnapshot?: ClientSnapshot;
};
```

### 9.9 Runtime Command Event

用于启动、重置、返回 launcher。

```ts
export type RuntimeCommandEvent = {
  eventId: string;
  timestamp: string;
  type: "runtime.command";
  command: "restart" | "back_to_launcher" | "inspect_state";
  clientSnapshot?: ClientSnapshot;
};
```

### 9.10 本地事件处理规则

前端本地处理以下事件，不请求 AI：

```text
input typing
number input typing
slider dragging
checkbox toggle, unless configured as ai_transition
select change, unless configured as ai_transition
stepper +/- click
local button with localAction
local tab switch
```

前端向 AI 发送以下事件：

```text
app.search
button click with interaction.mode = ai_transition
component.commit
form.submit
tabs.change with interaction.mode = ai_transition
modal.close with interaction.mode = ai_transition
runtime.command, except pure local restart
```

---

## 10. 记忆系统设计

后端 AI 必须维护记忆。记忆不是聊天历史，而是运行时状态。

记忆分为：

```text
turn memory:
  当前轮事件相关上下文。短生命周期。

session memory:
  当前用户打开 runtime 后的连续交互上下文。

app memory:
  当前 AI 生成的“临时应用”的内部状态。类似模拟数据库。

user memory:
  跨 session 的长期用户偏好。MVP 可先 mock。
```

### 10.1 Memory 类型

```ts
export type AUIRMemory = {
  turn: Record<string, unknown>;
  session: Record<string, unknown>;
  app: Record<string, unknown>;
  user: RetrievedUserMemory[];
};
```

### 10.2 RetrievedUserMemory

```ts
export type RetrievedUserMemory = {
  key: string;
  value: unknown;
  source: "explicit" | "inferred" | "system";
  confidence: number;
  createdAt?: string;
  lastUsedAt?: string;
  sensitivity?: "low" | "medium" | "high";
};
```

### 10.3 Memory Patch

AI 不应直接覆盖长期记忆。AI 只能提出 patch 和候选记忆。

```ts
export type AUIRMemoryPatch = {
  session?: JsonPatchOperation[];
  app?: JsonPatchOperation[];
  userCandidates?: UserMemoryCandidate[];
};
```

```ts
export type JsonPatchOperation = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};
```

```ts
export type UserMemoryCandidate = {
  key: string;
  value: unknown;
  reason: string;
  confidence: number;
  source: "explicit" | "inferred";
  requiresUserConsent: boolean;
};
```

MVP 实现要求：

```text
1. session memory 和 app memory 必须实现。
2. user memory 可以 mock。
3. memory patch 应能 apply 到本地 state。
4. 模拟数据只能进入 app memory，不能进入长期 user memory。
```

---

## 11. Tools 设计：优先用 Vercel AI SDK tools

第一版可先完全 hallucinated；但文档和代码结构要预留 tools。

工具层原则：

```text
AI 可以请求工具；
Runtime 决定是否执行；
工具输入输出必须有 Zod schema；
工具结果必须标记 source；
工具结果再反馈给 AI 生成下一版 UI。
```

### 11.1 工具描述

```ts
export type AUIRToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputTrustLevel: "real" | "simulated" | "estimated";
  requiresUserConfirmation: boolean;
};
```

### 11.2 工具请求

```ts
export type AUIRToolRequest = {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
  requiresUserConfirmation: boolean;
};
```

### 11.3 MVP 安全工具

可以先实现这些 mock/安全工具：

```text
safeCalculator:
  执行基础数学计算。

generateChartData:
  根据输入生成模拟 chart 数据。

estimateRocketCycle:
  返回演示用火箭循环估计值，必须标记 estimated/simulated。

summarizeState:
  总结当前 app/session memory，供调试。
```

不要实现：

```text
runShellCommand
readAnyFile
writeAnyFile
browseRealWeb
accessEmail
accessBankAccount
```

---

## 12. Constraints 设计

每次请求都携带运行时约束。约束不仅限制组件类型，也限制布局能力和交互刷新策略。

```ts
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

  layoutPolicy: {
    allowMultiColumn: boolean;
    allowGrid: boolean;
    allowSplitView: boolean;
    maxGridColumns: number;
    maxRegions: number;
  };

  interactionPolicy: {
    defaultInputMode: "local" | "ai_transition";
    defaultButtonMode: "ai_transition" | "local";
    requireClientSnapshotForAITransition: boolean;
    allowLocalActions: boolean;
    allowDebouncedAITransitions: boolean;
  };

  transitionPolicy: {
    preferMinimalChange: boolean;
    preserveStableIds: boolean;
    preserveUserInputs: boolean;
    allowMajorRedesignOnlyOn: string[];
  };
};
```

默认约束：

```ts
export const defaultConstraints: AUIRConstraints = {
  renderMode: "full_state",
  allowedComponents: [
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
    "chart_line"
  ],
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
    maxRegions: 8
  },
  interactionPolicy: {
    defaultInputMode: "local",
    defaultButtonMode: "ai_transition",
    requireClientSnapshotForAITransition: true,
    allowLocalActions: true,
    allowDebouncedAITransitions: false
  },
  transitionPolicy: {
    preferMinimalChange: true,
    preserveStableIds: true,
    preserveUserInputs: true,
    allowMajorRedesignOnlyOn: ["app.search", "explicit_redesign_request"]
  }
};
```

核心原则：

```text
AI 可以充分设计布局，但只能通过受限 layout primitives。
AI 可以指定哪些交互是 local，哪些交互会触发 ai_transition。
前端必须在 ai_transition 事件中附带 localState snapshot。
AI 生成下一版 UI 时，必须先吸收 clientSnapshot 中的最新本地输入值。
```

---

## 13. Zod Schema

请在 `src/auir/schema.ts` 中使用 Zod 建立运行时校验。

至少需要：

```ts
export const uiNodeSchema = ...
export const auirStateSchema = ...
export const auirEventSchema = ...
export const auirMemorySchema = ...
export const auirRequestSchema = ...
export const auirResponseSchema = ...
```

要求：

```text
1. API route 收到前端请求后校验 AUIRRequest。
2. Vercel AI SDK structured output 使用同一套 Zod schema。
3. AI 返回结果后再次校验 AUIRResponse。
4. 校验失败时最多 repair/retry 一次。
5. retry 仍失败时返回 fallback error UI。
```

注意：Zod schema 既是运行时校验，也是模型输出合同。不要让 TypeScript 类型和 Zod schema 分裂。

---

## 14. AI Runtime：使用 Vercel AI SDK

请在 `src/ai/generateNextState.ts` 中实现核心函数：

```ts
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { auirResponseSchema } from "@/src/auir/schema";
import { buildAUIRSystemPrompt } from "@/src/auir/prompt";

export async function generateNextAUIRState(request: AUIRRequest): Promise<AUIRResponse> {
  const result = await generateObject({
    model: openai(process.env.AI_MODEL ?? "gpt-4.1"),
    schema: auirResponseSchema,
    system: buildAUIRSystemPrompt(),
    prompt: JSON.stringify({
      request,
      instruction:
        "Return exactly one valid AUIRResponse object. Do not include Markdown or explanations."
    })
  });

  return result.object;
}
```

如果实际版本的 AI SDK API 有变化，以当前安装版本文档为准，但设计目标不变：

```text
用 AI SDK 的 structured output 生成 AUIRResponse；
不要手动解析 Markdown；
不要让模型随意输出字符串 JSON。
```

### 14.1 Streaming 可选

第一版可以使用 `generateObject`。后续可升级为：

```text
streamObject
```

用途：

```text
1. UI 生成时显示 partial progress。
2. 大 UI tree 渲染时降低等待感。
3. 后期支持 progressive UI。
```

第一版不强制 streaming，因为完整 state 更容易调试。

---

## 15. AI System Prompt

请在 `src/auir/prompt.ts` 中定义 system prompt。

```text
You are AUIR Engine, an AI-UI co-execution runtime.

You are not a one-shot UI generator.
You inhabit the UI you generate.
The generated UI is your interaction surface.
Each UI component is a semantic affordance you create for future user intent capture.
User interactions are returned to you as structured semantic events.
Your job is to transform previous UI state, memory, client-local draft state, and the current event into the next application state and next UI.

You do not write executable code.
You do not output HTML.
You do not output JSX.
You do not output Markdown.
You only output a JSON object that matches the AUIRResponse schema.

You are both:
1. the semantic UI designer
2. the simulated backend state transition engine
3. the memory-aware application controller

Core rules:
1. Always return protocol = "AUIR" and version = "0.3".
2. Always return a complete next state.
3. Generate only components included in constraints.allowedComponents.
4. Do not exceed constraints.maxNodes.
5. Do not exceed constraints.maxDepth.
6. You may design multi-column, grid, split-view, toolbar, region-based, and dashboard layouts using the allowed layout primitives.
7. Do not default to a single-column layout unless it is the best interface for the task.
8. Preserve stable component ids across turns whenever possible.
9. Preserve user-entered values unless the event clearly resets or changes them.
10. When the event contains clientSnapshot.localState, treat those values as the latest user-edited values and reconcile app memory with them before generating results.
11. Inputs, sliders, steppers, checkboxes, and parameter controls should default to local interaction mode. They should update frontend localState without forcing a full AI transition.
12. Buttons such as Calculate, Analyze, Compare, Generate, Apply, Submit, Next, and Run should usually use ai_transition mode and includeLocalStateOnCommit = true.
13. Every button must include a clear intent string.
14. Every input must include a binding string.
15. Every interactive node should include semanticRole and expectedEffect when useful.
16. Prefer minimal coherent UI changes after ordinary interactions.
17. Major redesign is allowed only for app.search or explicit redesign requests.
18. Never claim to access real files, real network, real bank accounts, real emails, or real system commands unless a trusted tool result is provided.
19. If data is simulated, mark diagnostics.simulatedData = true and label relevant metrics as confidence = "simulated" or "estimated".
20. Never store simulated app content as factual user memory.
21. Use app memory for simulated app data.
22. Use session memory for current task and workflow progress.
23. Only propose user memory candidates for explicit preferences or repeated stable behavior.
24. Keep the interface useful, compact, and coherent.
25. If the requested app is unsafe, impossible, or asks for real-world access you do not have, generate a safe simulated alternative UI.
26. Return valid JSON only.
```

The model must understand the difference between local interaction and AI transition:

```text
Local interaction changes the frontend local draft state only.
AI transition generates the next semantic UI state.
AI transition events include a clientSnapshot containing all locally edited values.
```

---

## 16. API Route

实现：

```text
POST /api/ai-ui
```

请求体：

```ts
AUIRRequest
```

响应体：

```ts
AUIRResponse
```

后端流程：

```text
1. 解析 request body
2. 使用 Zod 校验 request
3. 如果 USE_MOCK_AI=true 或没有 API key，调用 mock runtime
4. 否则调用 Vercel AI SDK generateObject
5. 校验 AUIRResponse
6. apply memory patch
7. 返回 response
8. 如果任何步骤失败，返回 fallback UI
```

伪代码：

```ts
export async function POST(req: NextRequest) {
  const json = await req.json();

  const parsed = auirRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(createFallbackResponse("Invalid AUIRRequest"), { status: 400 });
  }

  const request = parsed.data;

  try {
    const response =
      process.env.USE_MOCK_AI === "true" || !process.env.OPENAI_API_KEY
        ? await mockGenerateNextAUIRState(request)
        : await generateNextAUIRState(request);

    const checked = auirResponseSchema.safeParse(response);
    if (!checked.success) {
      return NextResponse.json(createFallbackResponse("Invalid AUIRResponse"));
    }

    return NextResponse.json(checked.data);
  } catch (error) {
    return NextResponse.json(createFallbackResponse("AI runtime failed"));
  }
}
```

---

## 17. CopilotKit 接入策略

### 17.1 第一版：可选调试面板

不要一开始把 CopilotKit 变成主交互入口。第一版主交互仍然是 AI 生成的 AUIR UI。

CopilotKit 可用于：

```text
1. 在侧边栏显示当前 runtime state。
2. 允许开发者用自然语言调试当前 AUIR app。
3. 暴露安全 frontend actions，例如 restart、inspect state、explain current UI。
4. 后续接 AG-UI / external agent。
```

### 17.2 CopilotProvider

在 `src/copilot/CopilotProvider.tsx` 中封装：

```tsx
"use client";

import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-ui/styles.css";

export function AppCopilotProvider({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      {children}
    </CopilotKit>
  );
}
```

如果第一版不启用 CopilotKit，保留文件但不要强制渲染。

### 17.3 useCopilotReadable

可把当前 AUIR state 暴露给 CopilotKit：

```tsx
useCopilotReadable({
  description: "Current AUIR runtime state",
  value: {
    app: state?.app,
    memory,
    turn
  }
});
```

### 17.4 useCopilotAction

注册安全动作：

```tsx
useCopilotAction({
  name: "restart_runtime",
  description: "Restart the AI UI runtime and return to launcher.",
  parameters: [],
  handler: async () => {
    resetRuntime();
    return "Runtime restarted.";
  }
});
```

不要注册危险动作：

```text
run_shell
read_file
write_file
execute_code
```

### 17.5 CopilotKit 在本项目中的边界

CopilotKit 是 agentic frontend layer，不是 AUIR 的替代品。

本项目第一版的主线仍然是：

```text
AUIR Event -> Vercel AI SDK -> AUIR Response -> AUIR Renderer
```

CopilotKit 作为：

```text
debug assistant
side-channel copilot
future AG-UI bridge
human-in-the-loop layer
```

---

## 18. Renderer 设计

`src/runtime/Renderer.tsx` 接收：

```ts
type RendererProps = {
  node: UINode;
  localState: LocalUIState;
  setLocalValue: (binding: string, value: unknown) => void;
  onAIEvent: (event: AUIREvent) => void;
};
```

Renderer 是 AUIR 协议解释器，不是业务应用。它负责：

```text
1. 根据 UINode 渲染 React 组件。
2. 根据 layout primitives 渲染 row、column、grid、split、region、toolbar。
3. 根据 binding 读取 localState 中的最新 draft value。
4. 对 local interaction 只更新 localState，不请求 AI。
5. 对 ai_transition interaction 构造 AUIREvent，并附带 clientSnapshot。
```

要求：

```text
1. 不使用 dangerouslySetInnerHTML。
2. 不执行任何 AI 返回的代码。
3. 不从 AI 返回的字符串中解析 JS。
4. input / slider / stepper 默认不请求 AI。
5. button 默认请求 AI，除非 interaction.mode = "local"。
6. select / checkbox 默认只更新 localState，除非声明 ai_transition。
7. chart 使用静态数据渲染，不执行 AI 代码。
8. code_block 只显示代码文本，不执行代码。
```

### 18.1 本地值读取规则

输入组件显示值时优先级：

```text
localState.values[binding]
  > node.value / node.checked
  > empty default
```

这样当用户拖 slider 或点击 stepper 后，页面可以即时显示变化，而不依赖 AI 返回新 UI。

### 18.2 本地交互伪代码

```ts
function handleLocalChange(binding: string, nextValue: unknown) {
  setLocalValue(binding, nextValue);
}
```

Stepper 示例：

```ts
function handleStepperIncrement(node: StepperNode) {
  const current = Number(localState.values[node.binding] ?? node.value ?? 0);
  const step = node.step ?? 1;
  const next = Math.min(node.max ?? Infinity, current + step);
  setLocalValue(node.binding, next);
}
```

### 18.3 AI transition 伪代码

```ts
function createClientSnapshot(): ClientSnapshot {
  return {
    localState,
    currentVisibleBindings: collectVisibleBindingsFromCurrentUI(state.ui, localState)
  };
}

function handleAIButtonClick(node: ButtonNode) {
  onAIEvent({
    eventId: createEventId(),
    timestamp: new Date().toISOString(),
    type: "component.click",
    target: {
      id: node.id,
      type: node.type,
      label: node.label,
      intent: node.intent,
      semanticRole: node.semanticRole,
      expectedEffect: node.expectedEffect
    },
    payload: {},
    clientSnapshot: createClientSnapshot()
  });
}
```

---

## 19. 前端状态循环：加入 localState，避免每次输入都刷新 AI

`app/page.tsx` 应维护：

```ts
const [state, setState] = useState<AUIRState | null>(null);
const [memory, setMemory] = useState<AUIRMemory>(initialMemory);
const [localState, setLocalState] = useState<LocalUIState>(initialLocalUIState);
const [turn, setTurn] = useState(0);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

localState 更新函数：

```ts
function setLocalValue(binding: string, value: unknown) {
  setLocalState((prev) => ({
    values: {
      ...prev.values,
      [binding]: value
    },
    dirtyBindings: Array.from(new Set([...prev.dirtyBindings, binding])),
    updatedAt: new Date().toISOString()
  }));
}
```

AI transition 事件流程：

```text
1. 用户在输入框 / slider / stepper / select 中调整参数。
2. 前端只更新 localState，不请求 AI。
3. 用户点击 Calculate / Analyze / Compare 等按钮。
4. 前端构造 AUIREvent，并附带 clientSnapshot.localState。
5. 后端 AI 读取 clientSnapshot，更新 app memory，生成下一版 UI。
6. 前端 setState(response.next)。
7. 前端用 response.next.memory 重新 hydrate localState，清空 dirtyBindings。
```

每次 AI response 后，应将 AI 返回的绑定值同步到 localState：

```ts
function hydrateLocalStateFromAUIRState(next: AUIRState): LocalUIState {
  return {
    values: extractBindingsFromUI(next.ui, next.memory),
    dirtyBindings: [],
    updatedAt: new Date().toISOString()
  };
}
```

注意：

```text
response.next.memory 是 AI 返回的当前 app/session memory 快照。
response.memoryPatch 是 AI 对 memory manager 的建议。
MVP 可以简单采用 response.next.memory。
后续再严格使用 patch。
```

---

## 20. Mock AI Runtime

如果没有 API key，提供 mock runtime。

Mock 行为：

```text
1. 如果 event.type 是 app.search：
   根据 query 生成一个多区域 dashboard，而不是单列页面。
2. 如果点击 calculate_performance：
   从 event.clientSnapshot.localState.values 读取所有本地输入值，生成估算结果。
3. 如果点击 compare_cycles：
   从 event.clientSnapshot.localState.values 读取所有本地输入值，生成循环对比表。
4. 如果 input / slider / stepper 变化：
   默认不触发 mock runtime，由前端本地 localState 处理。
5. 如果 runtime.command restart：
   返回 launcher 或由前端重置。
```

Mock 至少支持：

```text
rocket engine cycle analyzer
```

初始界面必须体现多区域布局，例如：

```text
screen layoutMode = "dashboard"
  header / toolbar
  split horizontal
    primary: main parameter workspace
    secondary: inspector / assumptions panel
  bottom/results region
```

建议界面：

```text
Header Toolbar
  - app title
  - reset button

Left/Main Panel: Engine Inputs
  - chamber pressure number_input or stepper
  - mixture ratio slider
  - expansion ratio stepper
  - cycle type select
  - Calculate Performance button, ai_transition

Right Inspector Panel
  - current local parameter summary via local_value_display
  - simulation assumptions
  - warning that data is simulated

Results Region
  - estimated Isp metric
  - mass flow metric
  - compare cycles button, ai_transition
```

点击 `calculate_performance` 后，mock 应读取 `clientSnapshot.localState.values`，而不是只读旧 memory。

点击 `compare_cycles` 后，生成：

```text
Gas Generator
Expander
Staged Combustion
```

并保持用户刚才在本地调过的参数。

---

## 21. Error Fallback UI

当 AI 输出非法、API 失败或 schema validation 失败时，返回 fallback UI：

```ts
{
  protocol: "AUIR",
  version: "0.2",
  next: {
    app: {
      id: "error_app",
      title: "Runtime Error",
      kind: "unknown"
    },
    memory: {
      app: {},
      session: {}
    },
    ui: {
      id: "error_screen",
      type: "screen",
      title: "Runtime Error",
      children: [
        {
          id: "error_alert",
          type: "alert",
          tone: "danger",
          title: "AI UI generation failed",
          message: "The model returned an invalid UI state. Try another request."
        },
        {
          id: "restart_button",
          type: "button",
          label: "Start Over",
          intent: "restart_runtime",
          semanticRole: "navigation",
          expectedEffect: "Return to launcher"
        }
      ]
    }
  },
  diagnostics: {
    warnings: ["Fallback UI generated by runtime."]
  }
}
```

点击 `restart_runtime` 后前端回到初始搜索页。

---

## 22. 样式设计

使用 Tailwind CSS。

整体风格：

```text
深色背景
卡片式 panel
圆角
轻微边框
紧凑 dashboard 风格
```

推荐：

```text
body: bg-neutral-950 text-neutral-100
panel: bg-neutral-900 border border-neutral-800 rounded-xl p-4
button primary: bg-blue-600 hover:bg-blue-500
input: bg-neutral-800 border border-neutral-700 rounded-lg
text muted: text-neutral-400
alert warning: bg-yellow-950 border-yellow-800
alert danger: bg-red-950 border-red-800
```

---

## 23. README 要求

README 必须说明：

```text
1. 项目是什么
2. 为什么不是 prompt-to-UI
3. 什么是 AI-UI Co-Execution Runtime
4. 如何安装
5. 如何配置环境变量
6. 如何启动
7. AUIR 协议基本说明
8. Vercel AI SDK 在项目中的作用
9. CopilotKit 在项目中的可选作用
10. 当前支持的 UI 组件
11. 安全限制
12. Mock 模式说明
13. 未来 Electron 桌面化路线
```

README 中必须明确写：

```text
This project does not execute AI-generated code.
The LLM only returns constrained semantic UI states.
The frontend is a renderer for a semantic UI protocol.
The application exists in the loop between LLM, generated UI, structured events, tools, and memory.
```

---

## 24. 安全边界

必须实现并遵守：

```text
1. 禁止执行 AI 生成的代码。
2. 禁止 dangerouslySetInnerHTML。
3. 禁止 AI 返回 HTML/JSX 并直接渲染。
4. 禁止真实 shell 命令执行。
5. 禁止真实文件系统访问。
6. 禁止真实网络浏览器代理。
7. 禁止把模拟数据当成真实数据。
8. 所有 AI 输出必须经过 Zod 校验。
9. 所有组件必须来自 allowedComponents。
10. 所有文本长度、节点数量、嵌套深度必须限制。
11. 工具调用必须有 schema 和 permission boundary。
12. CopilotKit actions 只能暴露安全 frontend actions。
13. code_block 只显示代码，不执行代码。
```

---

## 25. MVP 验收标准

### 25.1 初始启动

打开页面后看到搜索框。

输入：

```text
rocket engine cycle analyzer
```

点击回车后，前端发送 `app.search` 事件。

后端返回一个火箭发动机循环分析工具 UI。

### 25.2 多区域 UI 渲染

前端必须正确渲染非单列布局，包括至少一种：

```text
split
region
grid
toolbar
multi-panel dashboard
```

页面不应只是单列组件堆叠。AI 生成的示例 app 应体现：

```text
顶部工具栏
左侧/主参数区域
右侧 inspector 或说明区域
结果区域
```

### 25.3 本地交互不刷新 AI

用户修改以下元素时，不应立即请求 `/api/ai-ui`：

```text
number_input
text_input
slider
stepper
checkbox
select, unless configured as ai_transition
```

这些操作只应更新前端 `localState`，并立即更新页面上的本地显示。

### 25.4 AI transition 携带本地状态

用户点击：

```text
Calculate Performance
Compare Cycles
Analyze
Generate
Apply
```

这类按钮时，前端发送 `component.click`，并必须包含：

```ts
clientSnapshot.localState.values
```

后端 AI 必须使用这些值生成下一版 UI。

### 25.5 UI 渲染组件

前端正确渲染：

```text
heading
panel
grid
split
region
toolbar
number_input
slider
stepper
select
local_value_display
metric
button
table
alert
```

### 25.6 记忆连续性

修改过的输入值应该被保留。  
点击计算按钮后不应该丢失之前本地调节过的参数。  
AI 不应该每次事件后完全重画无关 UI。  
AI 应该根据 clientSnapshot 更新 app memory。

### 25.7 Mock 模式

没有 API key 时，仍能完成基本演示，并且 mock runtime 也必须支持：

```text
local input changes do not call AI
calculate button reads clientSnapshot
multi-region layout rendering
```

---

## 26. 建议实现顺序

请严格按以下顺序实现：

```text
1. 初始化 Next.js + TypeScript + Tailwind
2. 安装 ai / zod / @ai-sdk/openai
3. 定义 AUIR TypeScript 类型
4. 定义 Zod schema
5. 实现 default constraints
6. 实现 initial memory
7. 实现 fallback UI
8. 实现 Renderer
9. 实现 SearchLauncher
10. 实现前端事件构造
11. 实现 mock AI runtime
12. 实现 /api/ai-ui route
13. 接入 Vercel AI SDK generateObject
14. 实现 schema validation
15. 实现 memory merge / patch
16. 添加 DebugPanel / AUIRInspector
17. 可选接入 CopilotKit Provider
18. 可选注册 useCopilotReadable / useCopilotAction
19. 写 README
```

---

## 27. 第一版不要做

明确不要实现：

```text
真实 OS
真实文件系统
真实终端
真实浏览器
真实数据库
真实用户登录
插件市场
拖拽窗口
多 app 并行
复杂 patch 更新
AI 生成代码执行
HTML iframe 渲染
真实 shell tool
无限制 CopilotKit action
```

第一版只证明核心闭环：

```text
AI-generated semantic UI
+ structured user events
+ memory
+ Vercel AI SDK structured output
+ safe React renderer
```

---

## 28. 后续路线

### 28.1 v0.2：Streaming UI

使用 `streamObject` 或自定义 partial state，让 UI 生成过程可视化。

### 28.2 v0.3：Patch 模式

从 full-state update 升级为：

```text
JSON Patch / partial node replacement
```

### 28.3 v0.4：Tool Runtime

加入安全工具：

```text
calculator
chart generator
local mock database
domain-specific estimators
```

### 28.4 v0.5：CopilotKit 深度接入

把 CopilotKit 用作：

```text
side copilot
human-in-the-loop
shared state
debug agent
AG-UI bridge
```

### 28.5 v0.6：Electron 桌面壳

Web App 跑通后，可用 Electron 封装为 GUI App。  
核心代码保持不变，只新增 desktop host。

---

## 29. 示例 AUIR 请求

```json
{
  "protocol": "AUIR",
  "version": "0.2",
  "session": {
    "sessionId": "sess_demo",
    "turn": 0
  },
  "previous": null,
  "event": {
    "eventId": "evt_001",
    "timestamp": "2026-06-06T12:00:00.000Z",
    "type": "app.search",
    "query": "rocket engine cycle analyzer"
  },
  "memory": {
    "turn": {},
    "session": {},
    "app": {},
    "user": []
  },
  "constraints": {
    "renderMode": "full_state",
    "allowedComponents": [
      "screen",
      "container",
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
      "table",
      "metric",
      "alert",
      "tabs",
      "modal",
      "code_block",
      "chart_bar",
      "chart_line"
    ],
    "maxNodes": 80,
    "maxDepth": 8,
    "maxTextLength": 4000,
    "allowExternalData": false,
    "allowCodeExecution": false,
    "allowToolUse": false,
    "styleSystem": "semantic_tokens_only",
    "transitionPolicy": {
      "preferMinimalChange": true,
      "preserveStableIds": true,
      "preserveUserInputs": true,
      "allowMajorRedesignOnlyOn": [
        "app.search",
        "explicit_redesign_request"
      ]
    }
  },
  "availableTools": []
}
```

---

## 30. 示例 AUIR 响应

```json
{
  "protocol": "AUIR",
  "version": "0.2",
  "next": {
    "app": {
      "id": "rocket_engine_cycle_analyzer",
      "title": "Rocket Engine Cycle Analyzer",
      "kind": "engineering_tool",
      "description": "A simulated engineering dashboard for comparing rocket engine cycles."
    },
    "memory": {
      "app": {
        "simulated": true,
        "inputs": {
          "chamberPressureMPa": 12,
          "mixtureRatio": 5.8,
          "expansionRatio": 80,
          "cycleType": "staged_combustion"
        }
      },
      "session": {
        "currentTask": "Analyze and compare rocket engine cycle parameters.",
        "currentView": "main_inputs"
      }
    },
    "ui": {
      "id": "main_screen",
      "type": "screen",
      "title": "Rocket Engine Cycle Analyzer",
      "children": [
        {
          "id": "title",
          "type": "heading",
          "level": 1,
          "text": "Rocket Engine Cycle Analyzer",
          "semanticRole": "display"
        },
        {
          "id": "input_panel",
          "type": "panel",
          "title": "Engine Inputs",
          "children": [
            {
              "id": "chamber_pressure",
              "type": "number_input",
              "label": "Chamber Pressure",
              "value": 12,
              "unit": "MPa",
              "binding": "app.inputs.chamberPressureMPa",
              "semanticRole": "input",
              "expectedEffect": "Update chamber pressure used for simulated engine estimates"
            },
            {
              "id": "mixture_ratio",
              "type": "number_input",
              "label": "Mixture Ratio",
              "value": 5.8,
              "binding": "app.inputs.mixtureRatio",
              "semanticRole": "input",
              "expectedEffect": "Update mixture ratio used for simulated engine estimates"
            },
            {
              "id": "expansion_ratio",
              "type": "number_input",
              "label": "Expansion Ratio",
              "value": 80,
              "binding": "app.inputs.expansionRatio",
              "semanticRole": "input",
              "expectedEffect": "Update expansion ratio used for simulated engine estimates"
            },
            {
              "id": "cycle_type",
              "type": "select",
              "label": "Cycle Type",
              "value": "staged_combustion",
              "binding": "app.inputs.cycleType",
              "semanticRole": "input",
              "expectedEffect": "Select the engine cycle to analyze",
              "options": [
                {
                  "label": "Gas Generator",
                  "value": "gas_generator"
                },
                {
                  "label": "Expander",
                  "value": "expander"
                },
                {
                  "label": "Staged Combustion",
                  "value": "staged_combustion"
                }
              ]
            }
          ]
        },
        {
          "id": "results_panel",
          "type": "panel",
          "title": "Estimated Results",
          "children": [
            {
              "id": "isp_metric",
              "type": "metric",
              "label": "Estimated Vacuum Isp",
              "value": 452,
              "unit": "s",
              "confidence": "estimated",
              "semanticRole": "simulation_result"
            },
            {
              "id": "mass_flow_metric",
              "type": "metric",
              "label": "Estimated Mass Flow",
              "value": 245,
              "unit": "kg/s",
              "confidence": "simulated",
              "semanticRole": "simulation_result"
            },
            {
              "id": "compare_cycles",
              "type": "button",
              "label": "Compare Cycles",
              "intent": "compare_cycle_options",
              "variant": "primary",
              "semanticRole": "analysis_action",
              "expectedEffect": "Generate a simulated comparison table for gas generator, expander, and staged combustion cycles"
            }
          ]
        },
        {
          "id": "simulation_notice",
          "type": "alert",
          "tone": "warning",
          "title": "Simulated Data",
          "message": "This demo does not run a real propulsion solver. Values are simulated or estimated by the AI runtime.",
          "semanticRole": "warning"
        }
      ]
    }
  },
  "memoryPatch": {
    "session": [
      {
        "op": "replace",
        "path": "/currentTask",
        "value": "Analyze and compare rocket engine cycle parameters."
      }
    ],
    "app": [
      {
        "op": "replace",
        "path": "/simulated",
        "value": true
      }
    ],
    "userCandidates": []
  },
  "toolRequests": [],
  "diagnostics": {
    "eventInterpretedAs": "user requested a simulated rocket engine cycle analysis application",
    "stateTransition": "launcher -> rocket_engine_cycle_analyzer",
    "simulatedData": true
  }
}
```

---

## 31. 示例：本地调参 + 点击计算

### 31.1 用户本地调参，不请求 AI

用户把 chamber pressure 从 12 调到 15，把 mixture ratio 从 5.8 调到 6.0。前端只更新：

```json
{
  "values": {
    "app.inputs.chamberPressureMPa": 15,
    "app.inputs.mixtureRatio": 6.0,
    "app.inputs.expansionRatio": 80,
    "app.inputs.cycleType": "staged_combustion"
  },
  "dirtyBindings": [
    "app.inputs.chamberPressureMPa",
    "app.inputs.mixtureRatio"
  ],
  "updatedAt": "2026-06-06T12:01:30.000Z"
}
```

此时不调用 `/api/ai-ui`。

### 31.2 用户点击 Calculate Performance，请求 AI transition

```json
{
  "eventId": "evt_002",
  "timestamp": "2026-06-06T12:01:35.000Z",
  "type": "component.click",
  "target": {
    "id": "calculate_performance",
    "type": "button",
    "label": "Calculate Performance",
    "intent": "calculate_engine_performance",
    "semanticRole": "analysis_action",
    "expectedEffect": "use current local input values to generate performance estimates and update result panels"
  },
  "payload": {},
  "clientSnapshot": {
    "localState": {
      "values": {
        "app.inputs.chamberPressureMPa": 15,
        "app.inputs.mixtureRatio": 6.0,
        "app.inputs.expansionRatio": 80,
        "app.inputs.cycleType": "staged_combustion"
      },
      "dirtyBindings": [
        "app.inputs.chamberPressureMPa",
        "app.inputs.mixtureRatio"
      ],
      "updatedAt": "2026-06-06T12:01:30.000Z"
    },
    "currentVisibleBindings": {
      "app.inputs.chamberPressureMPa": 15,
      "app.inputs.mixtureRatio": 6.0,
      "app.inputs.expansionRatio": 80,
      "app.inputs.cycleType": "staged_combustion"
    }
  }
}
```

AI 必须以 `clientSnapshot.localState.values` 为最新事实，而不是以旧 UI node value 或旧 memory 为准。

---

## 32. 最终交付物

coding agent 最终应交付：

```text
1. 可运行 Next.js 工程
2. AUIR 协议类型
3. Zod schema 校验
4. Vercel AI SDK structured output runtime
5. Mock AI runtime
6. 前端 AUIR renderer
7. 事件采集与发送循环
8. session/app memory 机制
9. fallback UI
10. DebugPanel / AUIRInspector
11. 可选 CopilotKit Provider 与安全 actions
12. README
13. .env.example
```

最终运行命令：

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

即可演示完整循环。

---

## 32. 参考工具与设计依据

实现时优先参考以下工具的官方文档与源码：

```text
Vercel AI SDK:
  - structured output
  - generateObject / streamObject
  - tools
  - provider abstraction

CopilotKit:
  - React frontend stack for agents
  - Generative UI
  - shared state
  - useCopilotReadable
  - useCopilotAction
  - AG-UI integration concepts

Zod:
  - runtime schema validation
  - type inference
```

工程目标不是复刻这些框架，而是将它们组合成：

```text
一个具有记忆、事件协议、语义 UI AST 和安全渲染器的 AI-UI 共执行应用运行时。
```
