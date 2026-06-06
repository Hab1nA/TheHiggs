---
description: "TheHiggs 项目专属开发规范。AI-UI Co-Execution Runtime 工程实现准则。适用于所有编码、审查、重构任务。"
applyTo: ["**"]
---

# TheHiggs — 项目开发规范

> AI-UI Co-Execution Runtime  
> AI 驻留在自己生成的 UI 中，UI 是 AI 的交互表面，用户事件是 AI 状态转移的输入。

---

## 0. 项目核心定义（必须理解）

本项目**不是**"自然语言生成 UI"的工具，也**不是**"Prompt-to-UI 一次性生成"。

```
正确理解：
App = LLM Agent + Generated Semantic UI + Event Protocol + Memory + Tool Runtime

错误理解：
App = User Prompt → AI generates one-shot HTML/JSX page
```

核心循环：
```
用户意图/事件 → 前端捕获结构化事件 → Runtime 构建上下文 → AI SDK 调用 LLM
→ LLM 返回下一版语义 UI State + Memory Patch → Runtime 校验 → 前端渲染 → 重复
```

---

## 1. 技术栈约束（不可随意替换）

| 层级 | 技术 | 职责 |
|------|------|------|
| 前端宿主 | Next.js App Router (v15+) | 路由、渲染、API Route |
| 语言 | TypeScript (strict) | 全栈类型安全 |
| UI 样式 | Tailwind CSS (v4) | 语义 token 驱动样式 |
| 模型调用 | Vercel AI SDK (`ai` + `@ai-sdk/openai`) | generateObject、streaming、tool calling |
| 结构化校验 | Zod | AI 输出合同、API 入参校验 |
| Agentic Frontend | CopilotKit (可选) | 调试面板、shared state、AG-UI |
| 协议 | AUIR (自研) | UI AST、Event AST、Memory、Constraints |

**严禁**：
- 手写 `fetch()` 调 OpenAI API（必须用 AI SDK）
- 让 AI 输出 Markdown / 字符串 JSON 再手动 `JSON.parse()`（必须用 `generateObject` + Zod schema）
- 用其他 UI 库替代 Tailwind CSS（如 styled-components、CSS Modules）

---

## 2. 工程结构（必须遵循）

```
app/
  layout.tsx          # 根布局
  page.tsx            # App Launcher 入口
  globals.css         # Tailwind + 全局样式
  api/
    ai-ui/
      route.ts        # POST /api/ai-ui — 核心 AI Runtime endpoint
    copilotkit/
      route.ts        # CopilotKit runtime endpoint（可选）

src/
  auir/               # AUIR 协议层（本项目核心）
    types.ts          # 所有 AUIR 类型定义
    schema.ts         # Zod schema（运行时校验 + 模型输出合同）
    prompt.ts         # AI System Prompt
    constraints.ts    # 运行时约束与默认值
    memory.ts         # Memory 系统实现
    validate.ts       # 校验 + repair + fallback
    fallback.ts       # Fallback UI 生成
    examples.ts       # 协议示例

  ai/                 # AI 调用层
    model.ts          # Provider 配置
    runtime.ts        # AI Runtime 主逻辑
    generateNextState.ts  # generateObject 核心调用
    tools.ts          # 工具注册
    mockRuntime.ts    # Mock AI Runtime（无需 API Key）

  runtime/            # 前端 Runtime 层
    Renderer.tsx      # AUIR State → React UI 渲染器
    event.ts          # 事件捕获与构造
    client.ts         # API 调用客户端
    state.ts          # 前端 State 管理
    bindings.ts       # binding → localState 双向绑定

  copilot/            # CopilotKit 集成层（可选）
    CopilotProvider.tsx
    actions.ts
    readableState.ts

  components/         # React UI 组件
    Shell.tsx         # 应用外壳（屏幕布局）
    SearchLauncher.tsx # App Launcher 搜索框
    LoadingOverlay.tsx
    ErrorPanel.tsx
    DebugPanel.tsx
    AUIRInspector.tsx # AUIR State 可视化调试面板

.env.example          # 环境变量模板
```

`src/copilot/` 和 `app/api/copilotkit/` 第一版可暂时为空，但目录和架构须为后续接入保留位置。

---

## 3. AUIR 协议核心规则

### 3.1 AI 只能输出受限 UI AST

- AI **禁止**生成 HTML、JSX、CSS、JavaScript、Python 或任何可执行代码
- AI **禁止**输出 Markdown
- AI 只能输出符合 `AUIRResponse` Zod schema 的 JSON 对象
- 前端是 UI AST 的**协议解释器**，不执行业务逻辑

### 3.2 支持的节点类型（白名单）

**布局类**：`screen`, `container`, `grid`, `split`, `region`, `toolbar`, `spacer`, `divider`
**组合类**：`panel`, `tabs`, `modal`, `drawer`
**内容类**：`heading`, `text`, `table`, `metric`, `alert`, `code_block`, `chart_bar`, `chart_line`
**输入类**：`button`, `text_input`, `number_input`, `textarea`, `select`, `checkbox`, `slider`, `stepper`
**运行时类**：`local_value_display`

**禁止的节点**：`html`, `iframe`, `script`, `raw_js`, `raw_css`, `arbitrary_react_component`, `terminal_exec`, `browser_exec`, `file_access`

### 3.3 本地交互 vs AI 状态转移

```
local interaction:
  用户操作只改变前端本地 draft state，不立即请求 AI
  适用：输入框、slider、加减按钮、checkbox、select、参数微调

ai_transition interaction:
  用户操作构造 AUIREvent，请求 AI 生成下一版 UI
  适用：Calculate、Analyze、Compare、Generate、Next、Submit、Apply
  事件必须包含 clientSnapshot（所有本地编辑值的快照）
```

默认规则：
- `text_input` / `number_input` / `textarea` / `slider` / `checkbox` / `select` / `stepper` → mode = `"local"`
- `button` → mode = `"ai_transition"`
- ai_transition 按钮须设置 `includeLocalStateOnCommit = true`

### 3.4 组件语义字段（必须填充）

每个交互节点应尽可能携带：
- `semanticRole`：`navigation | input | analysis_action | local_adjustment | display | warning | confirmation | tool_result | simulation_result`
- `intent`：人类可读的操作意图字符串
- `expectedEffect`：对该操作预期效果的自然语言描述
- `binding`：输入控件的状态绑定路径

### 3.5 样式系统限制

- 只能使用 `NodeLayoutHints`（width/height/align/justify/grow/order 语义 token）
- 只能使用 `NodeStyleTokens`（tone/density/emphasis 语义 token）
- **禁止**在 UI AST 中嵌入任意 CSS class、inline style、Tailwind class

---

## 4. 安全红线（绝对不可违反）

1. **AI 不输出代码** — 返回 Zod 校验的受限 JSON
2. **禁止 `dangerouslySetInnerHTML`** — 前端不渲染任何原始 HTML
3. **禁止代码执行** — 不允许 AI 生成的任何代码在客户端或服务端执行
4. **禁止真实文件/网络访问** — AI 不能访问文件系统、真实网络、真实 API
5. **模拟数据必须标记** — `diagnostics.simulatedData = true`，指标 `confidence = "simulated" | "estimated"`
6. **模拟数据不进长期记忆** — 只能进入 `app memory`，不能进入 `user memory`
7. **禁止的工具**：`runShellCommand`, `readAnyFile`, `writeAnyFile`, `browseRealWeb`, `accessEmail`, `accessBankAccount`

---

## 5. 记忆系统规则

每次 AI 状态转移必须维护记忆（不是聊天历史）：

| 记忆层 | 生命周期 | 说明 |
|--------|----------|------|
| turn memory | 当前轮 | 当前事件相关上下文 |
| session memory | 当前会话 | 用户打开 runtime 后的连续交互上下文 |
| app memory | 当前"虚拟应用" | AI 生成的临时应用内部状态 |
| user memory | 跨 session | 长期用户偏好（MVP 可 mock） |

- AI **只能提出** memory patch，不能直接覆盖长期记忆
- `userCandidates` 中 `requiresUserConsent: true` 的条目需要用户确认

---

## 6. API Route 规范

### POST /api/ai-ui

流程：
1. 解析 request body → Zod 校验 `AUIRRequest`
2. 若 `USE_MOCK_AI=true` 或无 API Key → 调用 `mockRuntime`
3. 否则调用 Vercel AI SDK `generateObject`
4. Zod 校验 `AUIRResponse`
5. Apply memory patch
6. 返回 response
7. 任何步骤失败 → 返回 fallback UI（最多 retry 一次）

### 可选：CopilotKit endpoint
`app/api/copilotkit/route.ts` — 为后续 CopilotKit 集成预留

---

## 7. 代码规范

### TypeScript
- `strict: true`，所有类型显式声明
- 禁止 `any`（除非有明确注释说明原因）
- AUIR 类型和 Zod schema 必须保持同步，不能分裂

### 文件命名
- 组件文件：`PascalCase.tsx`
- 工具/库文件：`camelCase.ts`
- 类型文件：`camelCase.ts`
- API route：`route.ts`（Next.js 约定）

### 导入顺序
1. React / Next.js 核心
2. 第三方库
3. `@/*` 别名导入
4. 相对路径导入

### 注释
- 模块顶部用 JSDoc 说明职责
- 复杂逻辑必注释
- AUIR 节点示例用 JSON 注释（非 JSX）

---

## 8. Mock Runtime 要求

**必须实现** `USE_MOCK_AI=true` 模式。无 API Key 时工程仍可完整运行演示。

Mock Runtime 职责：
- 返回符合 AUIR 协议的预定义 response
- 支持基本的 state 转移（搜索 → 应用界面 → 交互响应）
- 演示 local interaction 与 ai_transition 的区别
- 展示至少一种 dashboard / grid / split 布局
- 包含模拟的 chart 数据、metric、table

---

## 9. 开发流程

1. **阅读文档**：先理解 `AI_UI_CoExecution_Runtime_Tech_Doc_v0.3_layout_local_interactions.md`
2. **按层开发**：AUIR 类型 → Schema → Prompt → AI Runtime → Renderer → Components
3. **优先 Mock**：先实现完整的 Mock Runtime 演示闭环，再接入真实 AI
4. **每层验证**：每实现一层，确保 TypeScript 编译通过、Zod 校验有效
5. **不跳过安全**：每个 AI 输出路径都必须经过 Zod 校验
6. **保持简洁**：第一版不引入不必要的抽象、不做过早优化

---

## 10. 禁止的模式

- ❌ 在组件中硬编码业务逻辑
- ❌ 绕过 Zod 直接信任 AI 输出
- ❌ 在 UI AST 中嵌入 HTML/JSX/CSS 字符串
- ❌ 使用 `any` 绕过类型检查
- ❌ 手写 `fetch()` 调 AI API
- ❌ 让 AI 返回 Markdown 再手动解析
- ❌ 创建与 AUIR 协议无关的独立页面/路由
- ❌ 将 CopilotKit chat 作为唯一交互入口
