# TheHiggs — LLM-Driven Semantic UI Runtime

[![Powered by OrcaRouter](https://img.shields.io/badge/Powered_by-OrcaRouter-2563eb)](https://www.orcarouter.ai/ref/ref_c2667d797b82b3181496)

一个类似 VibeOS 概念的技术演示项目。**应用不再由静态业务代码定义，而由 AI 驱动的结构化 UI 协议、事件协议和记忆系统共同定义。**

## 核心思想

传统应用由开发者编写固定的 UI 代码和业务逻辑。在这个项目中，这一切被一个运行时循环取代：

1. 用户在搜索框中描述想要的应用（如"做一个火箭发动机循环参数分析工具"）
2. 后端 AI **不生成可执行代码**，而是返回一套受限的结构化 UI 描述（AUIR 协议）
3. 前端作为**协议解释器**，将 UI 描述渲染为真实界面
4. 用户与界面交互时，前端将点击、输入等行为转为结构化事件
5. 后端 AI 结合当前 UI 状态、事件和记忆进行推理，生成下一版 UI
6. 前端重新渲染，循环继续

```
用户事件 → 前端采集结构化事件 → 后端 AI 推理 → 生成下一版 UI → 前端渲染 → 重复
```

## 安全边界

- **AI 只输出数据，不输出代码** — 返回受 Zod 校验的受限 JSON
- 前端是语义 UI 协议的渲染器，不执行业务逻辑
- 禁止 `dangerouslySetInnerHTML`、禁止代码执行、禁止真实文件/网络访问
- 所有模拟数据均明确标记

## 技术栈

| 层级             | 技术                                    | 职责                      |
| ---------------- | --------------------------------------- | ------------------------- |
| 前端宿主         | Next.js 15 App Router                   | 路由、渲染、API Route     |
| 语言             | TypeScript (strict)                     | 全栈类型安全              |
| UI 样式          | Tailwind CSS 4                          | 语义 token 驱动样式       |
| 模型调用         | Vercel AI SDK (`ai` + `@ai-sdk/openai`) | generateObject、streaming |
| 结构化校验       | Zod                                     | AI 输出合同、API 入参校验 |
| Agentic Frontend | CopilotKit (可选占位)                   | 调试面板、shared state    |

## 快速开始

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 即可体验。

无需 API Key 也能运行 — 内置 Mock AI Runtime 提供完整演示。配置 `.env.local`：

```env
OPENAI_API_KEY=sk-your-key-here   # 可选：真实 AI 调用
AI_MODEL=gpt-4.1                   # 可选：模型选择
USE_MOCK_AI=false                   # false=真实AI, true=Mock模式
```

## OrcaRouter（可选服务商）

[OrcaRouter](https://www.orcarouter.ai/) 是一个 OpenAI 兼容的 AI 网关：200+ 模型、按请求难度自动路由（`orcarouter/auto`）、$0 加价。本项目在 `src/ai/model.ts` 中将其注册为可选服务商，切换只需改环境变量，**无需改代码**：

```env
# 注册并创建 Key: https://www.orcarouter.ai/ref/ref_c2667d797b82b3181496
AI_PROVIDER=orcarouter
ORCAROUTER_API_KEY=sk-orca-your-key-here
ORCAROUTER_BASE_URL=https://api.orcarouter.ai/v1

# 显式指定模型（默认 orcarouter/auto 自动路由）
# AI_MODEL=orcarouter/auto
# AI_MODEL=deepseek/deepseek-v4-flash-vision-exp
# AI_MODEL=qwen/qwen3.8-flash
```


## AUIR 协议

AUIR (AI User Interface Runtime) 由四部分组成：

| 部分                         | 说明                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| **UI Description Language**  | 29 种节点类型：layout、composition、content、input、runtime      |
| **UI Event Language**        | 7 种结构化事件：app.search、component.click、component.commit 等 |
| **UI Memory Language**       | Turn / Session / App / User 四级记忆系统                         |
| **Runtime Control Language** | 安全约束、组件白名单、布局策略、交互策略                         |

### 当前支持的 UI 组件

**Layout**: screen, container, grid, split, region, toolbar, spacer, divider
**Composition**: panel, tabs, modal, drawer
**Content**: heading, text, table, metric, alert, code_block, chart_bar, chart_line
**Input**: button, text_input, number_input, textarea, select, checkbox, slider, stepper
**Runtime**: local_value_display

### Vercel AI SDK 在本项目中的作用

- `generateObject` + Zod schema 实现结构化输出
- Provider abstraction（OpenAI / Anthropic / Google / xAI）
- 内置 retry / repair 机制
- 不手写 `fetch()` 调 OpenAI API

### CopilotKit 的可选作用

第一版不强制 CopilotKit。保留 `src/copilot/` 占位，后续可用于：

- 调试用 side panel / chat surface
- `useCopilotReadable` 暴露当前 AUIR state
- `useCopilotAction` 注册安全 frontend actions
- AG-UI 风格集成

## 安全边界

- **AI 只输出数据，不输出代码** — 返回受 Zod 校验的受限 JSON
- 前端是语义 UI 协议的渲染器，不执行业务逻辑
- 禁止 `dangerouslySetInnerHTML`、禁止代码执行、禁止真实文件/网络访问
- 所有模拟数据均明确标记
- `code_block` 只显示代码，不执行代码
- 所有 AI 输出经过 Zod schema + constraints 双重校验

## 后续路线

| 版本 | 目标                                                          |
| ---- | ------------------------------------------------------------- |
| v0.2 | Streaming UI（`streamObject`）                                |
| v0.3 | Patch 模式（JSON Patch / partial node replacement）           |
| v0.4 | Tool Runtime（安全计算器、chart 生成器、领域估算器）          |
| v0.5 | CopilotKit 深度接入（side copilot、human-in-the-loop、AG-UI） |
| v0.6 | Electron 桌面壳                                               |

## 项目状态

MVP — 核心循环演示。不支持真实 OS、文件系统、终端、浏览器或代码执行。
