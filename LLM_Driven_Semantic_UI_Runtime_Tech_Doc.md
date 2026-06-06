# 技术文档：LLM-Driven Semantic UI Runtime Demo

## 1. 项目目标

实现一个类似 VibeOS 思路的技术演示 App。

该 App 的核心思想是：

用户打开应用后，首先看到一个搜索框。用户在搜索框中输入自己想要的“App”或“工具”描述，例如：

```text
做一个火箭发动机循环参数分析工具
```

系统将该请求发送给后端 AI。后端 AI 不生成可执行代码、不生成 HTML、不生成 JSX，而是生成一套受限的、结构化的 UI 描述语言。前端只负责解释这套 UI 描述语言，并把它渲染成真实界面。

用户与界面交互时，前端将点击、输入、提交等事件转换成结构化 UI 事件，再发送给后端 AI。后端 AI 根据当前 UI 状态、用户事件、会话记忆、App 记忆进行推理，生成下一版 UI 描述语言。前端重新渲染。

最终形成循环：

```text
User Event
  ↓
Frontend captures structured event
  ↓
Backend AI receives previous UI + memory + event
  ↓
AI generates next UI state
  ↓
Frontend validates and renders next UI
  ↓
Repeat
```

本项目不是要实现一个传统 Web App，而是实现一个：

```text
LLM-driven semantic UI runtime
```

其中：

```text
前端 = UI 协议解释器 / 渲染器 / 事件采集器
后端 = AI 状态转移引擎 / 记忆管理器 / Schema 校验层
AI = 非确定性的语义状态转移函数
```

核心命题：

```text
应用不再由静态业务代码定义，而由 UI 协议、事件协议、记忆系统和 LLM 状态转移函数共同定义。
```

---

## 2. 技术栈要求

请使用以下技术栈实现 MVP：

```text
Next.js App Router
TypeScript
React
Tailwind CSS
Zod
OpenAI API 或兼容 OpenAI API 的大模型接口
```

工程应能通过环境变量配置模型：

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1 或其他可用模型
```

如果开发环境没有真实 API key，也要提供 mock AI runtime，便于本地调试。

---

## 3. 项目结构

请按以下结构组织工程：

```text
vibe-ui-runtime/
  app/
    page.tsx
    api/
      ai-ui/
        route.ts

  src/
    auir/
      schema.ts
      types.ts
      prompt.ts
      validate.ts
      memory.ts
      mock.ts

    runtime/
      Renderer.tsx
      event.ts
      client.ts

    components/
      Shell.tsx
      SearchLauncher.tsx
      LoadingOverlay.tsx
      ErrorPanel.tsx

  .env.example
  package.json
  README.md
```

其中 `AUIR` 表示：

```text
AI User Interface Runtime
```

它是本项目的内部协议名称。

---

## 4. 核心协议：AUIR

### 4.1 AUIR 总体定义

AUIR 由三类语言组成：

```text
1. UI Description Language
   描述当前界面上有什么。

2. UI Event Language
   描述用户做了什么。

3. UI Memory Language
   描述当前 App 和用户会话记住了什么。
```

每一次前后端通信都使用 AUIR Request / Response。

---

## 5. TypeScript 类型设计

请在 `src/auir/types.ts` 中定义核心类型。

### 5.1 AUIRRequest

```ts
export type AUIRRequest = {
  protocol: "AUIR";
  version: "0.1";
  session: AUIRSession;
  previous: AUIRState | null;
  event: AUIREvent;
  memory: AUIRMemory;
  constraints: AUIRConstraints;
};
```

### 5.2 AUIRResponse

```ts
export type AUIRResponse = {
  protocol: "AUIR";
  version: "0.1";
  next: AUIRState;
  memoryPatch?: AUIRMemoryPatch;
  diagnostics?: AUIRDiagnostics;
};
```

### 5.3 Session

```ts
export type AUIRSession = {
  sessionId: string;
  appId?: string;
  turn: number;
};
```

### 5.4 State

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

### 5.5 App Descriptor

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

## 6. UI 节点协议

前端禁止执行 AI 生成的代码。AI 只能返回受限 UI AST。

请支持以下 UI 节点：

```text
screen
container
panel
heading
text
button
text_input
number_input
textarea
select
checkbox
slider
table
metric
alert
tabs
modal
code_block
chart_bar
chart_line
```

### 6.1 Base Node

```ts
export type BaseNode = {
  id: string;
  type: string;
  visible?: boolean;
};
```

所有节点必须有稳定 `id`。

### 6.2 Screen Node

```ts
export type ScreenNode = BaseNode & {
  type: "screen";
  title?: string;
  children: UINode[];
};
```

### 6.3 Container Node

```ts
export type ContainerNode = BaseNode & {
  type: "container";
  direction?: "row" | "column" | "grid";
  gap?: "xs" | "sm" | "md" | "lg";
  children: UINode[];
};
```

### 6.4 Panel Node

```ts
export type PanelNode = BaseNode & {
  type: "panel";
  title?: string;
  children: UINode[];
};
```

### 6.5 Heading Node

```ts
export type HeadingNode = BaseNode & {
  type: "heading";
  text: string;
  level?: 1 | 2 | 3 | 4;
};
```

### 6.6 Text Node

```ts
export type TextNode = BaseNode & {
  type: "text";
  text: string;
  tone?: "default" | "muted" | "success" | "warning" | "danger";
};
```

### 6.7 Button Node

```ts
export type ButtonNode = BaseNode & {
  type: "button";
  label: string;
  intent: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};
```

Button 必须有 `intent`。这个 `intent` 是 AI 给未来交互埋下的语义锚点。

### 6.8 Text Input Node

```ts
export type TextInputNode = BaseNode & {
  type: "text_input";
  label?: string;
  placeholder?: string;
  value?: string;
  binding: string;
};
```

### 6.9 Number Input Node

```ts
export type NumberInputNode = BaseNode & {
  type: "number_input";
  label?: string;
  placeholder?: string;
  value?: number;
  unit?: string;
  binding: string;
};
```

### 6.10 Textarea Node

```ts
export type TextareaNode = BaseNode & {
  type: "textarea";
  label?: string;
  placeholder?: string;
  value?: string;
  binding: string;
};
```

### 6.11 Select Node

```ts
export type SelectNode = BaseNode & {
  type: "select";
  label?: string;
  value?: string;
  binding: string;
  options: {
    label: string;
    value: string;
  }[];
};
```

### 6.12 Checkbox Node

```ts
export type CheckboxNode = BaseNode & {
  type: "checkbox";
  label: string;
  checked: boolean;
  binding: string;
};
```

### 6.13 Slider Node

```ts
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
```

### 6.14 Table Node

```ts
export type TableNode = BaseNode & {
  type: "table";
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
};
```

### 6.15 Metric Node

```ts
export type MetricNode = BaseNode & {
  type: "metric";
  label: string;
  value: string | number;
  unit?: string;
  confidence?: "real" | "simulated" | "estimated";
};
```

### 6.16 Alert Node

```ts
export type AlertNode = BaseNode & {
  type: "alert";
  title?: string;
  message: string;
  tone: "info" | "success" | "warning" | "danger";
};
```

### 6.17 Tabs Node

```ts
export type TabsNode = BaseNode & {
  type: "tabs";
  activeTab: string;
  tabs: {
    id: string;
    label: string;
    children: UINode[];
  }[];
};
```

### 6.18 Modal Node

```ts
export type ModalNode = BaseNode & {
  type: "modal";
  title: string;
  children: UINode[];
  closeIntent: string;
};
```

### 6.19 Code Block Node

```ts
export type CodeBlockNode = BaseNode & {
  type: "code_block";
  language?: string;
  code: string;
};
```

### 6.20 Chart Nodes

```ts
export type ChartBarNode = BaseNode & {
  type: "chart_bar";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  data: {
    label: string;
    value: number;
  }[];
};

export type ChartLineNode = BaseNode & {
  type: "chart_line";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  data: {
    x: string | number;
    y: number;
  }[];
};
```

### 6.21 UINode Union

```ts
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
```

---

## 7. UI 事件协议

请在 `src/runtime/event.ts` 或 `src/auir/types.ts` 中定义事件类型。

```ts
export type AUIREvent =
  | AppSearchEvent
  | ComponentClickEvent
  | ComponentValueChangeEvent
  | FormSubmitEvent
  | TabChangeEvent
  | ModalCloseEvent;
```

### 7.1 App Search Event

用户首次搜索想要的 App。

```ts
export type AppSearchEvent = {
  eventId: string;
  timestamp: string;
  type: "app.search";
  query: string;
};
```

### 7.2 Component Click Event

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
  };
  payload?: Record<string, unknown>;
};
```

### 7.3 Component Value Change Event

```ts
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
```

### 7.4 Form Submit Event

MVP 可以不做复杂表单，但保留协议。

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
};
```

### 7.5 Tab Change Event

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
};
```

### 7.6 Modal Close Event

```ts
export type ModalCloseEvent = {
  eventId: string;
  timestamp: string;
  type: "modal.close";
  target: {
    id: string;
    closeIntent?: string;
  };
};
```

---

## 8. 记忆系统设计

后端 AI 不应该只看当前 UI 和事件，还应该维护记忆。

记忆分为四层：

```text
turn memory:
  当前轮事件相关上下文。短生命周期。

session memory:
  当前用户打开 runtime 后的连续交互上下文。

app memory:
  当前 AI 生成的“假 app”的内部状态。类似模拟数据库。

user memory:
  跨 session 的长期用户偏好。MVP 可先用内存 mock，不要求真实持久化。
```

### 8.1 Memory 类型

```ts
export type AUIRMemory = {
  turn: Record<string, unknown>;
  session: Record<string, unknown>;
  app: Record<string, unknown>;
  user: RetrievedUserMemory[];
};
```

### 8.2 RetrievedUserMemory

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

### 8.3 Memory Patch

AI 不应该直接覆盖整个长期记忆。AI 只能提出 patch 和候选记忆。

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

MVP 可以先只实现：

```text
session memory
app memory
```

长期 user memory 可以只做 mock，不必真正写入数据库。

---

## 9. 记忆系统原则

必须遵守以下规则：

```text
1. 不要把 AI 模拟出来的数据写入长期用户记忆。
2. AI 生成的假 app 数据只能写入 app memory，并标记 simulated。
3. 用户明确表达的偏好可以作为 user memory candidate。
4. 用户反复表现出的稳定行为可以作为 user memory candidate，但 confidence 应低于明确表达。
5. 每轮 AI 调用前，Context Builder 只取相关记忆，不要把全部历史塞给模型。
6. session/app memory 可以直接参与 UI 生成。
7. user memory candidate 必须经过 Memory Manager 审查后才能写入。
```

---

## 10. Constraints 设计

每次请求都携带运行时约束。

```ts
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
```

默认约束：

```ts
export const defaultConstraints: AUIRConstraints = {
  renderMode: "full_state",
  allowedComponents: [
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
  maxNodes: 80,
  maxDepth: 8,
  maxTextLength: 4000,
  allowExternalData: false,
  allowCodeExecution: false,
  styleSystem: "semantic_tokens_only",
  transitionPolicy: {
    preferMinimalChange: true,
    preserveStableIds: true,
    preserveUserInputs: true,
    allowMajorRedesignOnlyOn: ["app.search", "explicit_redesign_request"]
  }
};
```

---

## 11. Diagnostics

用于调试，不渲染给普通用户。

```ts
export type AUIRDiagnostics = {
  eventInterpretedAs?: string;
  stateTransition?: string;
  simulatedData?: boolean;
  warnings?: string[];
};
```

---

## 12. Zod Schema

请在 `src/auir/schema.ts` 中使用 Zod 为所有核心结构建立运行时校验。

至少需要：

```ts
export const uiNodeSchema = ...
export const auirStateSchema = ...
export const auirRequestSchema = ...
export const auirResponseSchema = ...
```

要求：

```text
1. API route 收到前端请求后校验 AUIRRequest。
2. AI 返回结果后校验 AUIRResponse。
3. 校验失败时最多 retry 一次。
4. retry 仍失败时返回 fallback error UI。
```

---

## 13. 后端 API 设计

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
3. 构建 prompt
4. 调用 LLM
5. 解析 LLM 返回 JSON
6. 使用 Zod 校验 response
7. 如失败，携带错误信息 retry 一次
8. 如仍失败，返回 fallback UI
9. 应用 memory patch 到 session/app memory
10. 返回 response
```

MVP 可不接数据库，session memory 可以由前端随请求携带，后端只做校验和返回。

---

## 14. AI System Prompt

请在 `src/auir/prompt.ts` 中定义 system prompt。

内容如下：

```text
You are AUIR Engine, an AI-driven semantic UI runtime.

You do not write executable code.
You do not output HTML.
You do not output JSX.
You do not output Markdown.
You only output a JSON object that matches the AUIRResponse schema.

Your role:
You simulate an interactive application by transforming the previous UI state, memory, and a normalized user event into the next UI state.

You are both:
1. the semantic frontend designer
2. the simulated backend state transition engine

Core rules:
1. Always return protocol = "AUIR" and version = "0.1".
2. Always return a complete next state.
3. Generate only components included in constraints.allowedComponents.
4. Do not exceed constraints.maxNodes.
5. Do not exceed constraints.maxDepth.
6. Preserve stable component ids across turns whenever possible.
7. Preserve user-entered values unless the event clearly resets or changes them.
8. Prefer minimal coherent UI changes after ordinary interactions.
9. Major redesign is allowed only for app.search or explicit redesign requests.
10. Every button must include a clear intent string.
11. Every input must include a binding string.
12. Never claim to access real files, real network, real bank accounts, real emails, or real system commands.
13. If data is simulated, mark it in diagnostics.simulatedData = true and label relevant metrics as confidence = "simulated" or "estimated".
14. Never store simulated app content as factual user memory.
15. Use app memory for simulated app data.
16. Use session memory for current task and workflow progress.
17. Only propose user memory candidates for explicit preferences or repeated stable behavior.
18. Keep the interface useful, compact, and coherent.
19. If the requested app is unsafe, impossible, or asks for real-world access you do not have, generate a safe simulated alternative UI.
20. Return valid JSON only.
```

---

## 15. Prompt 输入格式

后端调用模型时，将以下结构作为 user message：

```json
{
  "request": "<AUIRRequest JSON>",
  "instruction": "Return exactly one valid AUIRResponse JSON object. Do not include Markdown or explanations."
}
```

如果第一次返回校验失败，retry prompt：

```text
Your previous output failed schema validation.

Validation errors:
...

Return a corrected AUIRResponse JSON object only.
```

---

## 16. Mock AI Runtime

如果没有 API key，提供 mock runtime。

Mock 行为：

```text
1. 如果 event.type 是 app.search：
   根据 query 生成一个简单 dashboard。
2. 如果点击 button：
   生成一个 alert 或切换一个 panel。
3. 如果 input value_change：
   更新 memory.app 中对应 binding 的值，并返回界面。
```

Mock 至少支持一个示例：

```text
用户搜索：rocket engine cycle analyzer
```

生成一个包含以下区域的界面：

```text
Engine Inputs
  - chamber pressure number_input
  - mixture ratio number_input
  - expansion ratio number_input
  - cycle type select

Results
  - estimated Isp metric
  - mass flow metric
  - compare cycles button
```

点击 `compare cycles` 后，生成对比表：

```text
Gas Generator
Expander
Staged Combustion
```

---

## 17. 前端页面设计

`app/page.tsx` 是主入口。

初始状态：

```text
居中显示一个搜索框
标题：Vibe UI Runtime
说明：Search for the app you want to hallucinate.
输入框 placeholder：e.g. build me a rocket engine cycle analyzer
```

用户提交后，创建 `app.search` event，发送到 `/api/ai-ui`。

收到响应后，渲染 `response.next.ui`。

页面需要维护：

```ts
const [state, setState] = useState<AUIRState | null>(null);
const [memory, setMemory] = useState<AUIRMemory>(initialMemory);
const [turn, setTurn] = useState(0);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

每次事件后：

```text
1. 构造 AUIRRequest
2. 发送 API
3. 收到 AUIRResponse
4. setState(response.next)
5. 根据 response.next.memory 更新本地 memory
6. turn + 1
```

---

## 18. Renderer 设计

`src/runtime/Renderer.tsx` 接收：

```ts
type RendererProps = {
  node: UINode;
  onEvent: (event: AUIREvent) => void;
};
```

它根据 `node.type` 渲染对应组件。

要求：

```text
1. 不使用 dangerouslySetInnerHTML。
2. 不执行任何 AI 返回的代码。
3. 不从 AI 返回的字符串中解析 JS。
4. 所有交互转成 AUIREvent。
5. input 不要每敲一个字就发给 AI，使用 onBlur 或 Enter。
6. button click 立即发事件。
7. select change 可以立即发事件。
8. slider 可以 onMouseUp 或 onBlur 发送，避免频繁请求。
```

---

## 19. 组件渲染要求

### 19.1 Button

点击后发送：

```ts
{
  eventId,
  timestamp,
  type: "component.click",
  target: {
    id: node.id,
    type: "button",
    label: node.label,
    intent: node.intent
  },
  payload: {}
}
```

### 19.2 Input

输入框本地维护临时值。

onBlur 后发送：

```ts
{
  eventId,
  timestamp,
  type: "component.value_change",
  target: {
    id: node.id,
    type: node.type,
    binding: node.binding
  },
  payload: {
    previousValue: node.value,
    nextValue: currentValue
  }
}
```

### 19.3 Tabs

切换 tab 后发送：

```ts
{
  eventId,
  timestamp,
  type: "tabs.change",
  target: {
    id: node.id
  },
  payload: {
    previousTab: node.activeTab,
    nextTab
  }
}
```

### 19.4 Modal

关闭 modal 后发送：

```ts
{
  eventId,
  timestamp,
  type: "modal.close",
  target: {
    id: node.id,
    closeIntent: node.closeIntent
  }
}
```

---

## 20. Client API

请在 `src/runtime/client.ts` 实现：

```ts
export async function sendAUIREvent(request: AUIRRequest): Promise<AUIRResponse> {
  const res = await fetch("/api/ai-ui", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!res.ok) {
    throw new Error(`AUIR request failed: ${res.status}`);
  }

  return res.json();
}
```

---

## 21. Error Fallback UI

当 AI 输出非法、API 失败或 schema validation 失败时，返回一个 fallback UI：

```ts
{
  protocol: "AUIR",
  version: "0.1",
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
          intent: "restart_runtime"
        }
      ]
    }
  },
  diagnostics: {
    warnings: ["Fallback UI generated by runtime."]
  }
}
```

点击 `restart_runtime` 后前端应回到初始搜索页。

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

不要过度美化。重点是协议、循环和交互。

推荐样式：

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

README 需要说明：

```text
1. 项目是什么
2. 如何安装
3. 如何配置环境变量
4. 如何启动
5. AUIR 协议基本说明
6. 当前支持的 UI 组件
7. 安全限制
8. Mock 模式说明
```

README 中要明确写：

```text
This project does not execute AI-generated code.
The LLM only returns constrained JSON UI states.
The frontend is a renderer for a semantic UI protocol.
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

### 25.2 UI 渲染

前端正确渲染：

```text
heading
panel
number_input
select
metric
button
table
alert
```

### 25.3 交互循环

用户修改 number input 后，onBlur 发送 `component.value_change` 事件。

AI 返回更新后的 UI。

用户点击 `Compare Cycles` 后，AI 返回一个循环对比表。

### 25.4 记忆连续性

修改过的输入值应该被保留。
点击按钮后不应该丢失之前输入的参数。
AI 不应该每次事件后完全重画无关 UI。

### 25.5 Mock 模式

没有 API key 时，仍能完成基本演示。

---

## 26. 建议实现顺序

请严格按以下顺序实现：

```text
1. 初始化 Next.js + TypeScript + Tailwind
2. 定义 AUIR TypeScript 类型
3. 定义 Zod schema
4. 实现 initial memory 和 default constraints
5. 实现 Renderer
6. 实现 SearchLauncher
7. 实现前端事件构造
8. 实现 /api/ai-ui route
9. 实现 mock AI runtime
10. 接入真实 LLM
11. 实现 schema validation + retry
12. 实现 fallback UI
13. 写 README
```

不要一开始做复杂窗口系统、桌面、任务栏、文件系统或真实浏览器。

---

## 27. 第一版不要做的功能

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
```

这些功能会显著增加复杂度。MVP 只证明核心循环。

---

## 28. 核心工程原则

实现时请始终遵守：

```text
协议优先，而不是界面优先。
状态机优先，而不是页面优先。
AI 只输出数据，不输出代码。
前端只解释协议，不理解业务逻辑。
后端只编排模型，不硬写具体 App 逻辑。
记忆系统必须区分真实用户输入和 AI 模拟数据。
```

---

## 29. 示例 AUIR 请求

```json
{
  "protocol": "AUIR",
  "version": "0.1",
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
  }
}
```

---

## 30. 示例 AUIR 响应

```json
{
  "protocol": "AUIR",
  "version": "0.1",
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
          "text": "Rocket Engine Cycle Analyzer"
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
              "binding": "app.inputs.chamberPressureMPa"
            },
            {
              "id": "mixture_ratio",
              "type": "number_input",
              "label": "Mixture Ratio",
              "value": 5.8,
              "binding": "app.inputs.mixtureRatio"
            },
            {
              "id": "expansion_ratio",
              "type": "number_input",
              "label": "Expansion Ratio",
              "value": 80,
              "binding": "app.inputs.expansionRatio"
            },
            {
              "id": "cycle_type",
              "type": "select",
              "label": "Cycle Type",
              "value": "staged_combustion",
              "binding": "app.inputs.cycleType",
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
              "confidence": "estimated"
            },
            {
              "id": "mass_flow_metric",
              "type": "metric",
              "label": "Estimated Mass Flow",
              "value": 245,
              "unit": "kg/s",
              "confidence": "simulated"
            },
            {
              "id": "compare_cycles",
              "type": "button",
              "label": "Compare Cycles",
              "intent": "compare_cycle_options",
              "variant": "primary"
            }
          ]
        },
        {
          "id": "simulation_notice",
          "type": "alert",
          "tone": "warning",
          "title": "Simulated Data",
          "message": "This demo does not run a real propulsion solver. Values are simulated or estimated by the AI runtime."
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
  "diagnostics": {
    "eventInterpretedAs": "user requested a simulated rocket engine cycle analysis application",
    "stateTransition": "launcher -> rocket_engine_cycle_analyzer",
    "simulatedData": true
  }
}
```

---

## 31. 最终交付物

coding agent 最终应交付：

```text
1. 可运行 Next.js 工程
2. AUIR 协议类型
3. Zod schema 校验
4. Mock AI runtime
5. 可选真实 LLM runtime
6. 前端协议渲染器
7. 事件采集与发送循环
8. 记忆字段和基础 memory patch 机制
9. README
10. .env.example
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
