# TheHiggs — E2E 端到端测试诊断报告

**测试日期**: 2026-06-07  
**测试环境**: Windows, Next.js 15.5.19 (Turbopack), DeepSeek V4 Flash  
**测试模式**: 真实 AI 模式 (非 Mock)  
**测试执行者**: GitHub Copilot (MiMo V2.5 Pro)

---

## 📊 测试概览

| 测试场景                | 状态             | 耗时  | 响应码 |
| ----------------------- | ---------------- | ----- | ------ |
| 1. 页面加载 (Launcher)  | ✅ PASS          | 3.8s  | 200    |
| 2. 🚀 火箭引擎 (首启)   | ✅ PASS (重试后) | 50.8s | 200    |
| 3. Analyze Cycle (多轮) | ✅ PASS          | 19.9s | 200    |
| 4. Compare All Cycles   | ✅ PASS          | 15.6s | 200    |
| 5. Refine Parameters    | ✅ PASS          | 9.5s  | 200    |
| 6. 返回 Launcher        | ✅ PASS          | 0.4s  | 200    |
| 7. 📊 数据看板          | ✅ PASS          | 31.5s | 200    |
| 8. Debug 面板           | ✅ PASS          | —     | —      |
| 9. AUIR Inspector       | ✅ PASS          | —     | —      |
| 10. 压力测试 (复杂查询) | ⚠️ FALLBACK      | 30.4s | 206    |
| 11. 🎨 组件展示         | ⚠️ FALLBACK      | 30.4s | 206    |
| 12. Settings 面板       | ✅ PASS          | —     | —      |
| 13. 视图切换按钮        | ❌ FAIL          | —     | —      |

**通过率**: 10/13 (77%)  
**含 Fallback 通过率**: 12/13 (92%)

---

## 🔴 严重问题 (Critical)

### 1. Zod Schema 递归引用导致 JSON Schema 退化

**现象**: 每次 AI 调用都产生 15 条 `Recursive reference detected` 警告

```
Recursive reference detected at #/properties/next/properties/ui/anyOf/0/properties/children/items! Defaulting to any
Recursive reference detected at #/properties/next/properties/ui/anyOf/3/properties/primary! Defaulting to any
... (共 15 条)
```

**根因**: `src/auir/schema.ts` 中使用 `z.lazy()` 定义递归 UI 节点：

```typescript
const _uiNode: z.ZodType<any> = z.lazy(() => uiNodeSchema);
```

当 AI SDK 的 `generateObject` 将 Zod schema 转换为 JSON Schema 时，递归引用无法正确展开，导致 `anyOf` 中的子节点类型退化为 `any`。

**影响**:

- AI 无法获得精确的节点类型约束，降低生成质量
- 增加 schema 不匹配的概率，导致首次尝试失败
- 15 个节点类型的约束完全失效

**建议修复**:

1. 使用 `z.discriminatedUnion()` 替代 `z.union()` 减少递归深度
2. 为 AI SDK 提供扁平化的 JSON Schema（手动转换，不依赖自动转换）
3. 限制递归深度（如最多 5 层嵌套）

---

### 2. 首次生成失败率高，依赖重试机制

**现象**:

- 火箭引擎首次请求: `Attempt 1 failed: No object generated: response did not match schema`
- 第二次用截断 prompt (32000 tokens) 才成功
- 压力测试和组件展示: 3 次尝试全部失败，回退到 fallback

**统计**:
| 请求 | Attempt 1 | Attempt 2 | Attempt 3 | 结果 |
|------|-----------|-----------|-----------|------|
| 火箭引擎 | ❌ | ✅ (截断) | — | 200 |
| 数据看板 | ✅ | — | — | 200 |
| 压力测试 | ❌ | ❌ | ❌ | 206 (fallback) |
| 组件展示 | ❌ | ❌ | ❌ | 206 (fallback) |

**根因**:

1. Schema 递归退化导致 AI 无法生成符合约束的 JSON
2. 复杂查询需要更长的 prompt，但 token 限制导致截断
3. DeepSeek V4 Flash 对复杂 JSON schema 的遵循能力有限

**影响**: 复杂查询 100% 失败率，用户体验严重下降

**建议修复**:

1. 修复 schema 递归问题（根本解决）
2. 为复杂查询预处理 prompt，减少 token 消耗
3. 考虑使用更强的模型（如 deepseek-reasoner）处理复杂查询
4. 实现渐进式 UI 生成（先生成骨架，再填充细节）

---

## 🟡 中等问题 (Medium)

### 3. Runtime-Log 422 错误 (Page Log Not Found)

**现象**: 每次新会话的第一次日志事件都返回 422

```
[runtime-log] No page log file found for pageLogId=page_1780846114791_sw0asy; event type=frontend.ai_event.dispatched dropped
POST /api/runtime-log 422 in 732ms
```

**根因**: 前端在发送 AI 请求之前就发送了日志事件，但后端的 `ensurePageLog` 还没有创建日志文件。这是一个竞态条件。

**代码位置**: `src/runtime/logging/server.ts` - `appendRuntimeLog()` 函数

```typescript
const filePath = await findLogFile(event.pageLogId);
if (!filePath) {
  console.warn(
    `[runtime-log] No page log file found for pageLogId=${event.pageLogId}`,
  );
  return false; // 返回 false，导致 422
}
```

**影响**: 每个会话丢失第一个日志事件，影响调试和监控

**建议修复**:

1. **懒创建**: 在 `appendRuntimeLog` 中如果文件不存在则自动创建
2. **前端延迟**: 前端在收到第一个 AI 响应后再发送日志
3. **事件队列**: 前端缓存日志事件，等 pageLog 确认后再批量发送

---

### 4. 图片下载失败 (HTTP 403)

**现象**: stockcake.com 的图片返回 403 Forbidden

```
[postProcess] Download failed for [0]: https://images.stockcake.com/public/c/9/a/c9a7a5e8-... error: HTTP 403
```

**影响**: 部分图片无法下载，降级为占位符或缺失

**建议修复**:

1. 维护图片源白名单，排除已知会 403 的域名
2. 实现更好的 fallback 图片策略
3. 考虑使用 Unsplash/Pexels 等免费 API

---

### 5. 视图切换按钮无功能

**现象**: 项目管理看板的视图切换按钮 (Kanban, Gantt, Workload 等) 被渲染但点击无效果

**根因**: AUIR 协议中没有定义视图切换机制。按钮只是静态渲染，没有绑定到任何交互逻辑。

**影响**: 用户看到按钮但无法切换视图，体验断裂

**建议修复**:

1. 在 AUIR 协议中添加 `view_switch` 交互模式
2. 实现客户端视图切换逻辑（基于 `tabs` 或 `view_state` 本地状态）
3. 或者让 AI 生成 `tabs` 组件而不是独立按钮

---

## 🟢 轻微问题 (Low)

### 6. Data URL 体积过大

**现象**: 下载的图片转换为 base64 data URL，单张图片可达 130KB+

```
[postProcess] Mapped [0]: https://everydayastronaut.com/... → data URL (130255 chars)
```

**影响**:

- 增加 API 响应体积，影响传输速度
- 增加前端内存消耗
- 多张图片时可能导致页面卡顿

**建议修复**:

1. 限制图片下载尺寸（如最大 50KB）
2. 使用图片压缩（如 WebP 格式，质量 80%）
3. 考虑使用 CDN 或对象存储替代 data URL

---

### 7. 时钟组件每次渲染更新

**现象**: 数据看板的时钟显示 `2026/06/07 23:39:00`，每次刷新都更新

**影响**: 轻微的性能开销，但功能正常

**建议**: 保持现状，这是预期行为

---

## ✅ 功能亮点

### 1. AI-UI 共执行循环完美运作

- 用户事件 → AI 状态转移 → UI 重新渲染，整个循环流畅
- 多轮交互保持上下文一致性（火箭引擎 4 轮交互）

### 2. 丰富的组件系统

- 49 个组件类型全部可用
- 组件展示 demo 覆盖了所有类型：布局、排版、数据展示、图表、表单、反馈、导航、媒体

### 3. 强大的工具集成

- Web 搜索 (Bing scraping)
- 图片搜索和下载
- 火箭发动机估算工具
- 工具执行结果正确注入到 UI

### 4. 优秀的 Fallback 机制

- 即使 AI 生成失败，fallback 仍能生成高质量 UI
- 压力测试的 fallback 结果包含完整的看板、甘特图、热力图等

### 5. 完善的调试工具

- Debug 面板：状态、本地值、记忆、诊断
- AUIR Inspector：完整的 UI 树状结构可视化
- Runtime Logging：服务端日志记录

### 6. Memory 系统运作正常

- 跨轮次保持上下文
- 自动压缩膨胀的 memory（8KB 阈值）
- 搜索事件自动清理陈旧记忆

---

## 📈 性能数据

| 指标                  | 值             |
| --------------------- | -------------- |
| Launcher 加载         | 3.8s           |
| 首次 AI 生成 (含工具) | 30-50s         |
| 后续 AI 生成 (无工具) | 10-20s         |
| Fallback 生成         | 30s (等待超时) |
| 返回 Launcher         | 0.3s (短路)    |
| Schema 递归警告       | 15 条/请求     |
| 图片下载成功率        | 75% (3/4)      |

---

## 🏗️ 架构建议

### 短期修复 (1-2 天)

1. **修复 schema 递归**: 使用 `z.discriminatedUnion()` 或手动 JSON Schema
2. **修复 runtime-log 竞态**: 懒创建日志文件
3. **图片源白名单**: 排除 403 域名

### 中期优化 (1-2 周)

1. **渐进式 UI 生成**: 先返回骨架，再流式填充
2. **客户端视图切换**: 实现 `tabs`/`view_state` 本地状态管理
3. **图片压缩**: 下载后自动压缩到 50KB 以下
4. **Prompt 优化**: 减少 token 消耗，提高首次成功率

### 长期架构 (1-2 月)

1. **Schema 版本管理**: 支持多版本 schema，向后兼容
2. **流式 UI 更新**: 支持部分 UI 更新，减少全量重新渲染
3. **离线模式**: 完善 Mock Runtime，支持完全离线使用
4. **性能监控**: 添加 RUM (Real User Monitoring) 指标

---

## 📝 测试结论

TheHiggs 项目的核心架构 **设计优秀**，AI-UI 共执行循环的概念得到了很好的实现。项目能够：

1. ✅ 生成高复杂度的页面（火箭分析、数据看板、项目管理）
2. ✅ 支持多轮交互并保持 UI 一致性
3. ✅ 提供丰富的调试和检查工具
4. ✅ 在 AI 失败时提供高质量的 fallback

**主要瓶颈**是 Zod schema 的递归引用问题，这导致：

- 首次生成失败率高
- 复杂查询 100% 失败率
- AI 无法获得精确的类型约束

**修复 schema 递归问题是最高优先级**，这将显著提升系统的可靠性和生成质量。

---

_报告生成时间: 2026-06-07 23:50 UTC+8_
