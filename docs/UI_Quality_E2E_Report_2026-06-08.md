# TheHiggs — UI 排版质量 E2E 诊断报告

**测试日期**: 2026-06-08  
**测试环境**: Windows, Next.js 15.5.19, DeepSeek V4 Flash, 真实 AI 模式  
**测试范围**: 6 个典型页面场景，覆盖所有主要组件类型  
**测试执行者**: GitHub Copilot (MiMo V2.5 Pro)

---

## 📊 测试场景总览

| #   | 场景         | 页面类型 | 核心组件               | UI 质量 |
| --- | ------------ | -------- | ---------------------- | ------- |
| 1   | 🚀 火箭引擎  | 工程工具 | 卡片、表格、指标、按钮 | ⚠️ 中等 |
| 2   | 火箭分析详情 | 深度分析 | 指标、图表、表格、列表 | ⚠️ 中等 |
| 3   | 📊 数据看板  | 仪表盘   | KPI、图表、表格        | ⚠️ 中等 |
| 4   | 数据详情     | 深度分析 | 图表、表格、指标       | ⚠️ 中等 |
| 5   | 📈 转化分析  | 分析看板 | 漏斗图、热图、列表     | ⚠️ 中等 |
| 6   | 🎨 组件展示  | 组件库   | 全组件类型             | ✅ 良好 |

---

## 🔴 严重问题 (Critical)

### 1. `chart_line` 渲染为柱状图而非折线图

**现象**: `chart_line` 组件的渲染器 (`ChartLineRender`) 生成的是**垂直柱状图**，而非用户期望的折线图（带连线的数据点）。

**代码位置**: `src/runtime/Renderer.tsx` — `ChartLineRender` 函数

```tsx
function ChartLineRender({ n }: RSimple) {
  const data = n.data as Array<{ x: string | number; y: number }>;
  const maxY = Math.max(...data.map((d) => d.y), 1);
  return (
    <div className="bg-neutral-900 rounded-lg p-4">
      {n.title ? <h4>...</h4> : null}
      <div className="flex items-end gap-1 h-32 mt-2">
        {data.slice(0, 20).map((item, i) => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div className="text-[8px] text-neutral-500 mb-0.5">{item.y}</div>
            <div
              className="bg-blue-600 w-full rounded-t"
              style={{ height: `${(item.y / maxY) * 100}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**问题**:

- 组件命名为 `chart_line`，但渲染逻辑与 `chart_bar` 几乎相同（都是柱状图）
- 用户看到 "Line Chart" 标题但看到的是柱状图，造成认知不一致
- 数据点之间没有连线，丢失了折线图的核心视觉特征

**影响**: 所有使用 `chart_line` 的页面（数据看板、转化分析等）都显示错误的图表类型

**建议修复**:

```tsx
function ChartLineRender({ n }: RSimple) {
  const data = n.data as Array<{ x: string | number; y: number }>;
  const maxY = Math.max(...data.map((d) => d.y), 1);
  const h = 128; // height in px
  const w = 100 / data.length; // width percentage per point

  // Calculate points for SVG polyline
  const points = data
    .map((item, i) => {
      const x = (i + 0.5) * w;
      const y = h - (item.y / maxY) * h;
      return `${x}%,${y}`;
    })
    .join(" ");

  return (
    <div className="bg-neutral-900 rounded-lg p-4">
      {n.title ? <h4>{String(n.title)}</h4> : null}
      <div className="relative h-32 mt-2">
        <svg
          className="w-full h-full"
          viewBox={`0 0 100 ${h}`}
          preserveAspectRatio="none"
        >
          <polyline
            points={points}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
          />
          {data.map((item, i) => (
            <circle
              key={i}
              cx={(i + 0.5) * w}
              cy={h - (item.y / maxY) * h}
              r="3"
              fill="#2563eb"
            />
          ))}
        </svg>
        {/* X-axis labels */}
        <div className="flex justify-between mt-1">
          {data.map((item, i) => (
            <span key={i} className="text-[10px] text-neutral-500">
              {String(item.x)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

### 2. 列表图标渲染为纯文本

**现象**: `list` 组件的 `icon` 字段被渲染为纯文本字符串，而非实际图标。

**示例** (转化分析页面):

```
- listitem:
  - generic: "edit"          ← 应该是编辑图标
  - generic: "优化结算页面表单..."
- listitem:
  - generic: "trending_up"   ← 应该是趋势图标
  - generic: "在热图高点击区域..."
```

**代码位置**: `src/runtime/Renderer.tsx` — `ListRender` 函数

```tsx
{
  !isOrdered && item.icon ? (
    <span className="text-neutral-500 mt-0.5 flex-shrink-0">
      {item.icon} {/* 直接渲染文本，没有图标库支持 */}
    </span>
  ) : !isOrdered ? (
    <span className="text-neutral-600 mt-0.5 flex-shrink-0">•</span>
  ) : null;
}
```

**问题**: AI 生成的图标名称（如 "edit", "trending_up", "star"）是 Material Design 图标名，但前端没有集成任何图标库

**影响**:

- 用户看到 "edit"、"trending_up"、"star" 等纯文本，而非图标
- 视觉体验差，信息传达效率低

**建议修复**:

1. **方案 A**: 集成 Lucide React 图标库（与 Tailwind 配合良好）
2. **方案 B**: 使用 Unicode emoji 作为 fallback（如 ✏️ 📈 ⭐）
3. **方案 C**: 在 prompt 中约束 AI 不要使用 icon 字段，改用 emoji 前缀

---

## 🟡 中等问题 (Medium)

### 3. 重复/冗余 H1 标题

**现象**: 多个页面出现 2-3 个 H1 标题，语义混乱。

**示例** (火箭引擎页面):

```
- heading "Rocket Engine Cycle Analyzer" [level=2]    ← App Card 标题
- heading "Rocket Engine Cycle Analyzer" [level=1]    ← 主标题 (重复!)
- heading "Rocket Engine Cycle Comparison" [level=1]  ← 又一个 H1!
```

**示例** (数据看板):

```
- heading "Revenue & User Analytics Dashboard" [level=2]
- heading "Revenue & User Analytics Dashboard" [level=1]  ← 与 H2 完全相同
- heading "Revenue & User Analytics" [level=1]             ← 第三个标题
```

**根因**: AI 在生成页面时，在 header 区域和内容区域各生成了一个 H1，且标题文字相同或近似。

**影响**:

- HTML 语义不正确（应只有一个 H1）
- 页面顶部空间被冗余标题占用
- 用户困惑：哪个是真正的页面标题？

**建议修复**:

1. 在 System Prompt 中约束：每个页面只有一个 H1
2. App Card 标题使用 H2，内容区域使用 H1
3. 或者在 beautify 阶段自动去重相同文字的标题

---

### 4. KPI 数值未格式化（无千位分隔符）

**现象**: KPI 卡片中的大数字显示为原始数值，无千位分隔符。

**示例** (数据看板):

```
- KPI: "12840000" USD    ← 应显示为 "12,840,000"
- KPI: "45230" users     ← 应显示为 "45,230"
```

而同一页面的表格中却正确格式化了：

```
- table cell: "$12,840,000"  ← 正确
- table cell: "45,230"       ← 正确
```

**根因**: AI 在生成 `metric`/`kpi_card` 节点的 `value` 字段时直接使用了原始数字字符串，而表格的 `rows` 数据中使用了格式化后的字符串。

**影响**: 大数字难以快速阅读，用户体验差

**建议修复**:

1. 在 `MetricRender` 和 `KPICardRender` 中添加自动格式化逻辑：

```tsx
function formatNumber(val: string | number): string {
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return num.toLocaleString();
}
```

2. 或在 beautify 阶段自动格式化数值

---

### 5. `chart_line` Y 轴数值标签过小

**现象**: `chart_line` 渲染器中的数值标签使用 `text-[8px]`，在高分屏上几乎不可见。

```tsx
<div className="text-[8px] text-neutral-500 mb-0.5">{item.y}</div>
```

**影响**: 数据点的数值难以阅读

**建议**: 使用 `text-[10px]` 或 `text-xs` (12px)

---

### 6. 热图使用图片而非实际组件

**现象**: 转化分析页面的"热图分析"区域使用了 `<img>` 标签加载外部图片，而非使用 AUIR 的 `heatmap` 组件。

**示例**:

```
- heading "热图分析" [level=2]
- figure "网页点击热图示例":
  - img "网页热图示例"        ← 外部图片，非 heatmap 组件
```

而组件展示页面正确使用了 `heatmap` 组件。

**根因**: AI 在生成转化分析页面时选择了 `image` 节点而非 `heatmap` 节点来展示热图数据。

**影响**:

- 图片可能加载失败（403 错误）
- 图片不可交互
- 数据不可动态更新

**建议**: 在 System Prompt 中明确：当需要展示数据热图时，优先使用 `heatmap` 组件而非 `image`

---

## 🟢 轻微问题 (Low)

### 7. `chart_bar` 标签宽度固定 `w-24`

**现象**: `ChartBarRender` 中的标签宽度固定为 `w-24` (96px)，长标签会被截断。

```tsx
<span className="text-xs text-neutral-400 w-24 truncate">{item.label}</span>
```

**影响**: 长标签显示为 "Pump Disc..." 而非完整文字

**建议**: 使用 `min-w-24` 替代 `w-24`，或根据最长标签动态计算宽度

---

### 8. Gauge 组件尺寸过小

**现象**: `GaugeRender` 的默认尺寸为 `w-24 h-12` (96px × 48px)，在详情页面中显得过小。

**影响**: 仪表盘指针和数值难以看清

**建议**: 将默认尺寸增大到 `w-32 h-16`，或提供 `lg` 作为默认

---

### 9. 进度条缺少百分比显示

**现象**: `ProgressRender` 只显示 "75 / 100" 的文字，但进度条本身没有百分比标注。

**影响**: 用户需要阅读文字才能了解进度

**建议**: 在进度条上方或内部显示百分比数字

---

## ✅ UI 质量亮点

### 1. 间距系统一致

- 使用 Tailwind 的 `p-4`、`gap-4`、`space-y-2` 等标准间距
- Density token (`compact`/`normal`/`spacious`) 正确映射到间距类
- 元素之间没有出现紧贴或重叠的情况

### 2. 交互元素全部可点击

- 所有 `button` 节点都有正确的 `onClick` 处理器
- `ai_transition` 按钮正确触发 AI 状态转移
- `local` 按钮正确更新本地状态
- `select`、`checkbox`、`slider`、`stepper` 等输入控件都有正确的事件绑定

### 3. 溢出处理良好

- `table` 使用 `overflow-x-auto` 防止水平溢出
- `chart_bar` 的进度条使用 `overflow-hidden` 防止内容溢出
- `modal` 使用 `max-h-[80vh] overflow-auto` 防止垂直溢出
- `carousel` 使用 `overflow-x-auto` 支持水平滚动

### 4. 暗色主题一致

- 所有组件使用 `bg-neutral-900`、`bg-neutral-800` 等一致的暗色系
- 文字颜色使用 `text-neutral-100`（主）、`text-neutral-400`（次）
- 边框使用 `border-neutral-800` 保持低对比度

### 5. 响应式布局基础

- `grid` 组件支持 `grid-cols-1` 到 `grid-cols-6`
- `split` 组件支持 `flex` 比例分配
- `container` 组件支持 `flex-wrap`

---

## 📋 问题优先级排序

| 优先级 | 问题                    | 影响范围         | 修复难度 |
| ------ | ----------------------- | ---------------- | -------- |
| P0     | chart_line 渲染为柱状图 | 所有折线图       | 中       |
| P1     | 列表图标渲染为纯文本    | 所有带图标的列表 | 低       |
| P1     | 重复 H1 标题            | 所有页面         | 低       |
| P2     | KPI 数值未格式化        | 所有 KPI 卡片    | 低       |
| P2     | 热图用图片而非组件      | 转化分析等页面   | 低       |
| P3     | chart_bar 标签截断      | 长标签场景       | 低       |
| P3     | Gauge 尺寸过小          | 仪表盘场景       | 低       |
| P3     | Y 轴标签过小            | 所有折线图       | 低       |

---

## 🔧 修复建议汇总

### Renderer 层修复 (src/runtime/Renderer.tsx)

1. **`ChartLineRender`**: 重写为 SVG 折线图，支持数据点连线
2. **`MetricRender` / `KPICardRender`**: 添加 `toLocaleString()` 数值格式化
3. **`ListRender`**: 集成图标库或使用 emoji fallback
4. **`ChartBarRender`**: 标签宽度改为 `min-w-24`
5. **`GaugeRender`**: 默认尺寸增大

### Prompt 层修复 (src/auir/prompt.ts)

1. 约束每个页面只有一个 H1 标题
2. 约束数据热图优先使用 `heatmap` 组件
3. 约束 KPI 数值使用千位分隔符格式
4. 约束不使用 Material Design 图标名（改用 emoji）

### Beautify 层修复 (src/auir/beautify.ts)

1. 自动去重相同文字的 H1 标题
2. 自动格式化大数值（>999 添加逗号）

---

_报告生成时间: 2026-06-08 00:20 UTC+8_
