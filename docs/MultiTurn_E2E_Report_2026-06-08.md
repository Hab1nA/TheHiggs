# TheHiggs — 多轮交互 E2E 诊断报告

**测试日期**: 2026-06-08  
**测试环境**: Windows, Next.js 15.5.19, DeepSeek V4 Flash  
**测试场景**: 火箭引擎分析工具 — 5 轮连续交互  
**测试执行者**: GitHub Copilot (MiMo V2.5 Pro)

---

## 📊 交互轮次总览

| 轮次 | 操作 | 结果 | 耗时 | 问题 |
|------|------|------|------|------|
| 1 | 启动 → 火箭引擎 | ✅ 成功 | ~38s | 无 |
| 2 | 点击 "Analyze Gas-Generator" | ✅ 成功 | ~23s | 无 |
| 3 | 点击 "Compare All Cycles" | ✅ 成功 | ~21s | 无 |
| 4 | 点击 "Back to Cycles" | ✅ 成功 | ~20s | 图片占位符未解析 |
| 5 | 点击 "Analyze Staged Combustion" | ✅ 成功 | ~22s | 图片占位符未解析 |
| 6 | 点击 "Compare with Gas Generator" | ✅ 成功 | ~25s | 无 |

**交互成功率**: 6/6 (100%)  
**平均响应时间**: ~25s

---

## 🔴 严重问题 (Critical)

### 1. 图片占位符未解析 — 多轮交互后出现

**现象**: 第 4 轮和第 5 轮中，图片显示为 `"🖼️ {{DOWNLOADED_IMAGE_1}}"` 等占位符字符串，而非实际图片。

**触发条件**: 从比较页面返回到循环选择页面后，AI 生成新 UI 时使用了 `{{DOWNLOADED_IMAGE_X}}` 占位符，但图片下载失败或未被替换。

**根因分析** (来自运行时日志):
```
[postProcess] Download failed for [0]: error: HTTP 403
[postProcess] Download failed for [1]: error: fetch failed
```

部分图片源被封锁（403）或网络不可达，导致下载失败。虽然有重试机制，但某些域名（如 researchgate.net、thespacetechie.com）完全不可访问。

**影响**: 用户看到原始占位符字符串，体验严重下降

**建议修复**:
1. **前端 Renderer 层**: 检测 `{{DOWNLOADED_IMAGE_X}}` 占位符，显示 fallback 图片或隐藏该区域
2. **图片源白名单**: 维护可靠的图片源列表，排除已知被封锁的域名
3. **本地缓存**: 已下载的图片应缓存到本地，后续轮次复用

---

### 2. 数据不一致 — 跨轮次指标值变化

**现象**: Gas Generator 的效率在不同轮次中显示不同值：
- 第 1 轮: `65%` Efficiency
- 第 4 轮: `~96%` Efficiency
- 第 5 轮: `98.5%` (Staged Combustion)

**根因**: AI 在每个轮次都重新生成数据，而非从 memory 中读取已验证的数据。记忆系统存储了 `searchQuery` 和 `imageBindings`，但**未存储具体的技术指标值**。

**影响**: 用户在不同视图中看到不一致的数据，降低信任度

**建议修复**:
1. **Memory 中存储关键指标**: 在 `app memory` 中存储已验证的技术指标（如 Isp、Thrust、Efficiency）
2. **Prompt 约束**: 要求 AI 在后续轮次中使用 memory 中存储的指标值
3. **数据验证层**: 在 beautify 阶段检查跨轮次数据一致性

---

### 3. 重复 H1 标题 — 所有轮次都存在

**现象**: 每个页面都有 2 个 H1 标题：
- App Card 区域的 H2 标题
- 内容区域的 H1 标题（与 H2 文字相同或近似）

**示例**:
```
- heading "Rocket Engine Cycle Analyzer" [level=2]   ← App Card
- heading "Gas-Generator Cycle Analysis" [level=1]   ← 内容区
- heading "Gas-Generator Cycle Analysis" [level=1]   ← 又一个 H1!
```

**影响**: HTML 语义不正确，页面空间浪费

---

## 🟡 中等问题 (Medium)

### 4. Web 搜索结果质量差

**现象**: 运行时日志显示 `webSearch` 返回的结果多为中文且不相关：

```json
{"title": "RocketMQ 官方网站", "url": "https://rocketmq.apache.org/"},
{"title": "rocket（英语单词）_百度百科", "url": "https://baike.baidu.com/..."},
{"title": "Rocket League", "url": "https://www.rocketleague.com/"}
```

**根因**: Bing scraping fallback 在中文环境下返回中文结果，且相关性排序不佳

**影响**: AI 无法获取高质量的英文技术资料，导致数据准确性下降

**建议**:
1. 使用 Serper.dev API（已在 .env.example 中配置但未启用）
2. 在搜索查询中添加 `language:en` 参数
3. 对搜索结果进行相关性过滤

---

### 5. 不安全的图片来源警告

**现象**: 多个页面显示 `⚠️ 不安全的图片来源` 警告

**根因**: 某些图片 URL 来自非 HTTPS 源或被标记为不安全的域名

**影响**: 用户看到安全警告，降低信任度

**建议**: 在图片下载时检查 URL 安全性，只使用 HTTPS 源

---

### 6. "Back to Cycles" 导航不一致

**现象**: 点击 "Back to Cycles" 后，生成的页面与原始循环选择页面不同：
- 原始页面: 3 个卡片 + 表格 + 柱状图
- 返回后: 3 个卡片 + "How to Use" 列表（无表格和柱状图）

**根因**: AI 每次都重新生成 UI，而非恢复之前的状态

**影响**: 用户期望看到相同的页面结构，但实际看到不同的布局

**建议**:
1. **客户端状态缓存**: 缓存之前的 UI 状态，返回时直接恢复
2. **Memory 中存储 UI 骨架**: 记录页面的主要结构布局

---

## 🟢 轻微问题 (Low)

### 7. 图片下载超时较长

**现象**: 某些图片下载耗时 10s+（如 thespacetechie.com）

**影响**: 增加整体响应时间

**建议**: 设置更短的下载超时（如 5s），超时后立即使用 fallback

---

### 8. 面包屑导航链接无效

**现象**: 面包屑中的链接（如 "Home"、"Cycles"）使用 `href="#"`，点击后不导航

**根因**: AI 生成的面包屑链接是静态占位符，没有绑定到实际导航逻辑

**建议**: 在 Renderer 中为面包屑链接添加点击事件，触发 AI 状态转移

---

## ✅ 记忆系统有效性评估

### 记忆系统工作正常的部分

从运行时日志可以看到，记忆系统在以下方面有效：

1. **Session Memory 跨轮次保持**:
   - Turn 1: `postProcess: false`
   - Turn 2: `selectedCycle: "gas_generator"`, `analysisReady: true`
   - Turn 3: `comparisonMode: true`
   - Turn 4: 所有 session 数据保持

2. **App Memory 保持搜索上下文**:
   - `searchQuery: "Rocket engine cycle analyzer"` 跨轮次保持
   - `imageBindings` 跨轮次保持

3. **Memory Patch 正确应用**:
   - AI 返回的 `memoryPatch` 被正确应用到 memory 中

### 记忆系统不足的部分

1. **未存储技术指标值**: 具体的 Isp、Thrust、Efficiency 等数值未被记忆
2. **未存储 UI 结构**: 页面布局和组件结构未被记忆
3. **未存储已下载图片**: 图片数据未被缓存，每轮重新下载

---

## 📈 多轮交互一致性评估

| 维度 | 评分 | 说明 |
|------|------|------|
| **App ID 一致性** | ✅ 5/5 | `rocket_engine_cycle_analyzer` 跨轮次保持 |
| **App 标题一致性** | ✅ 5/5 | "Rocket Engine Cycle Analyzer" 跨轮次保持 |
| **主题一致性** | ✅ 5/5 | 暗色主题、Tailwind 样式一致 |
| **导航一致性** | ⚠️ 3/5 | 面包屑更新但链接无效 |
| **数据一致性** | ❌ 2/5 | 指标值跨轮次变化 |
| **图片一致性** | ❌ 1/5 | 图片占位符问题严重 |
| **组件风格一致性** | ✅ 4/5 | 按钮、表格、图表风格一致 |

---

## 🔧 修复建议优先级

### P0 (紧急)
1. **修复图片占位符**: 前端 Renderer 检测并替换 `{{DOWNLOADED_IMAGE_X}}`
2. **存储关键指标到 Memory**: 在 app memory 中存储已验证的技术数据

### P1 (重要)
3. **修复重复 H1**: Prompt 约束每个页面只有一个 H1
4. **改进 Web 搜索质量**: 启用 Serper.dev API 或改进 Bing scraping
5. **客户端状态缓存**: 缓存已访问的页面状态

### P2 (改进)
6. **面包屑导航**: 为面包屑链接添加实际导航逻辑
7. **图片源白名单**: 维护可靠的图片源列表
8. **图片下载超时**: 设置更短的超时时间

---

*报告生成时间: 2026-06-08 01:00 UTC+8*
