# AUIR UI 元素汇总报告

> **项目**: TheHiggs — AI-UI Co-Execution Runtime  
> **协议版本**: AUIR v0.3  
> **生成日期**: 2026-06-08  
> **源文件**: `src/auir/schema.ts`, `src/auir/types.ts`, `src/auir/constraints.ts`

---

## 目录

1. [概述](#1-概述)
2. [基础属性 (BaseNode)](#2-基础属性-basenode)
3. [布局容器类 (Layout)](#3-布局容器类-layout)
4. [内容展示类 (Content)](#4-内容展示类-content)
5. [表单输入类 (Input)](#5-表单输入类-input)
6. [数据可视化类 (Data Viz)](#6-数据可视化类-data-viz)
7. [复合组件类 (Composite)](#7-复合组件类-composite)
8. [导航与反馈类 (Navigation & Feedback)](#8-导航与反馈类-navigation--feedback)
9. [运行时特殊组件 (Runtime)](#9-运行时特殊组件-runtime)
10. [样式与交互系统](#10-样式与交互系统)
11. [运行时约束](#11-运行时约束)

---

## 1. 概述

AUIR (AI User Interface Runtime) 是 TheHiggs 项目的 UI 描述协议。AI 不输出 HTML/JSX/Markdown，而是输出严格符合 AUIR JSON Schema 的结构化 UI 描述。运行时负责将 JSON 渲染为真实 UI。

**总组件数量**: **56 种**

| 分类       | 数量 | 组件列表                                                                                                          |
| ---------- | ---- | ----------------------------------------------------------------------------------------------------------------- |
| 布局容器   | 8    | screen, container, grid, split, region, toolbar, spacer, divider                                                  |
| 内容展示   | 8    | heading, text, image, metric, code_block, table, quote, card                                                      |
| 表单输入   | 10   | button, text_input, number_input, textarea, select, checkbox, slider, stepper, external_link, local_value_display |
| 数据可视化 | 8    | chart_bar, chart_line, gauge, heatmap, radar_chart, color_swatch, kpi_card, stat_group                            |
| 复合/容器  | 7    | panel, tabs, modal, drawer, carousel, accordion, empty_state                                                      |
| 反馈/状态  | 5    | alert, badge, progress, statistic, timeline                                                                       |
| 导航/辅助  | 5    | breadcrumb, tag, list, description_list, steps                                                                    |
| 运行时特殊 | 2    | clock, timer_refresh                                                                                              |

---

## 2. 基础属性 (BaseNode)

所有 UI 节点都继承以下基础属性：

| 属性             | 类型      | 说明                                                                                                                                     |
| ---------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | `string`  | **必填**。唯一标识符                                                                                                                     |
| `type`           | `string`  | **必填**。组件类型                                                                                                                       |
| `visible`        | `boolean` | 是否可见                                                                                                                                 |
| `semanticRole`   | `enum`    | 语义角色：`navigation` `input` `analysis_action` `local_adjustment` `display` `warning` `confirmation` `tool_result` `simulation_result` |
| `intent`         | `string`  | AI 意图标识                                                                                                                              |
| `expectedEffect` | `string`  | 预期效果描述                                                                                                                             |
| `layout`         | `object`  | 布局提示 (见下)                                                                                                                          |
| `style`          | `object`  | 样式标记 (见下)                                                                                                                          |

### 布局提示 (`layout`)

| 属性      | 可选值                                                |
| --------- | ----------------------------------------------------- |
| `width`   | `auto` `full` `content` `1/2` `1/3` `2/3` `1/4` `3/4` |
| `height`  | `auto` `full` `content`                               |
| `align`   | `start` `center` `end` `stretch`                      |
| `justify` | `start` `center` `end` `between`                      |
| `grow`    | `boolean`                                             |
| `order`   | `number`                                              |

### 样式标记 (`style`)

| 属性       | 可选值                                                   |
| ---------- | -------------------------------------------------------- |
| `tone`     | `default` `muted` `primary` `success` `warning` `danger` |
| `density`  | `compact` `normal` `spacious`                            |
| `emphasis` | `low` `medium` `high`                                    |

---

## 3. 布局容器类 (Layout)

### `screen` — 屏幕根节点

| 属性         | 类型       | 说明                                                 |
| ------------ | ---------- | ---------------------------------------------------- |
| `title`      | `string`   | 屏幕标题                                             |
| `layoutMode` | `enum`     | `single` `dashboard` `workspace` `document` `wizard` |
| `gap`        | `enum`     | `none` `xs` `sm` `md` `lg`                           |
| `children`   | `UINode[]` | 子节点                                               |

### `container` — 弹性容器

| 属性        | 类型       | 说明                       |
| ----------- | ---------- | -------------------------- |
| `direction` | `enum`     | `row` `column` `grid`      |
| `gap`       | `enum`     | `none` `xs` `sm` `md` `lg` |
| `wrap`      | `boolean`  | 是否换行                   |
| `columns`   | `1-6`      | 网格列数                   |
| `children`  | `UINode[]` | 子节点                     |

### `grid` — 网格容器

| 属性       | 类型            | 说明                |
| ---------- | --------------- | ------------------- |
| `columns`  | `1-6 \| "auto"` | **必填**。列数      |
| `gap`      | `enum`          | `xs` `sm` `md` `lg` |
| `children` | `UINode[]`      | 子节点              |

### `split` — 分栏布局

| 属性          | 类型     | 说明                              |
| ------------- | -------- | --------------------------------- |
| `orientation` | `enum`   | **必填**。`horizontal` `vertical` |
| `ratio`       | `enum`   | `1:1` `1:2` `2:1` `1:3` `3:1`     |
| `primary`     | `UINode` | 主区域                            |
| `secondary`   | `UINode` | 副区域                            |

### `region` — 语义区域

| 属性       | 类型       | 说明                                                                                |
| ---------- | ---------- | ----------------------------------------------------------------------------------- |
| `region`   | `enum`     | **必填**。`header` `sidebar` `main` `inspector` `footer` `toolbar` `results` `logs` |
| `gap`      | `enum`     | `none` `xs` `sm` `md` `lg`                                                          |
| `children` | `UINode[]` | 子节点                                                                              |

### `toolbar` — 工具栏

| 属性       | 类型       | 说明                       |
| ---------- | ---------- | -------------------------- |
| `gap`      | `enum`     | `none` `xs` `sm` `md` `lg` |
| `children` | `UINode[]` | 子节点                     |

### `spacer` — 间距

| 属性   | 类型   | 说明                |
| ------ | ------ | ------------------- |
| `size` | `enum` | `xs` `sm` `md` `lg` |

### `divider` — 分割线

| 属性          | 类型   | 说明                    |
| ------------- | ------ | ----------------------- |
| `orientation` | `enum` | `horizontal` `vertical` |

---

## 4. 内容展示类 (Content)

### `heading` — 标题

| 属性    | 类型     | 说明               |
| ------- | -------- | ------------------ |
| `text`  | `string` | **必填**。标题文本 |
| `level` | `1-4`    | 标题级别           |

### `text` — 文本

| 属性   | 类型     | 说明               |
| ------ | -------- | ------------------ |
| `text` | `string` | **必填**。文本内容 |

### `image` — 图片

| 属性      | 类型           | 说明                                                  |
| --------- | -------------- | ----------------------------------------------------- |
| `src`     | `string`       | **必填**。图片 URL (data: URL 或代理 URL)             |
| `alt`     | `string`       | 替代文本                                              |
| `width`   | `enum`         | `auto` `full` `content` `1/2` `1/3` `2/3` `1/4` `3/4` |
| `height`  | `enum`         | `auto` `content` `1/2` `1/3`                          |
| `fit`     | `enum`         | `cover` `contain` `fill` `none`                       |
| `radius`  | `enum`         | `none` `sm` `md` `lg` `full`                          |
| `caption` | `string`       | 图片标题                                              |
| `source`  | `{name, url?}` | 图片来源                                              |

### `metric` — 指标

| 属性         | 类型               | 说明                           |
| ------------ | ------------------ | ------------------------------ |
| `label`      | `string`           | **必填**。指标标签             |
| `value`      | `string \| number` | **必填**。指标值               |
| `unit`       | `string`           | 单位                           |
| `confidence` | `enum`             | `real` `simulated` `estimated` |

### `code_block` — 代码块

| 属性       | 类型     | 说明               |
| ---------- | -------- | ------------------ |
| `code`     | `string` | **必填**。代码内容 |
| `language` | `string` | 编程语言           |

### `table` — 表格

| 属性      | 类型                                          | 说明             |
| --------- | --------------------------------------------- | ---------------- |
| `columns` | `string[]`                                    | **必填**。列标题 |
| `rows`    | `Array<Array<string\|number\|boolean\|null>>` | **必填**。数据行 |

### `quote` — 引用块

| 属性     | 类型     | 说明                        |
| -------- | -------- | --------------------------- |
| `text`   | `string` | **必填**。引用文本          |
| `author` | `string` | 作者                        |
| `source` | `string` | 来源                        |
| `tone`   | `enum`   | `default` `muted` `primary` |

### `card` — 增强卡片

| 属性       | 类型       | 说明                       |
| ---------- | ---------- | -------------------------- |
| `title`    | `string`   | 标题                       |
| `subtitle` | `string`   | 副标题                     |
| `image`    | `string`   | 顶部图片 URL               |
| `footer`   | `UINode[]` | 底部操作区                 |
| `gap`      | `enum`     | `none` `xs` `sm` `md` `lg` |
| `children` | `UINode[]` | 子节点                     |

---

## 5. 表单输入类 (Input)

### `button` — 按钮

| 属性          | 类型                | 说明                                   |
| ------------- | ------------------- | -------------------------------------- |
| `label`       | `string`            | **必填**。按钮文本                     |
| `intent`      | `string`            | **必填**。意图标识                     |
| `variant`     | `enum`              | `primary` `secondary` `ghost` `danger` |
| `interaction` | `InteractionPolicy` | 交互策略                               |
| `localAction` | `LocalAction`       | 本地动作 (增减/设置值/切换/追加文本)   |

### `text_input` — 文本输入

| 属性          | 类型                | 说明                 |
| ------------- | ------------------- | -------------------- |
| `label`       | `string`            | 标签                 |
| `placeholder` | `string`            | 占位文本             |
| `value`       | `string`            | 初始值               |
| `binding`     | `string`            | **必填**。状态绑定键 |
| `interaction` | `InteractionPolicy` | 交互策略             |

### `number_input` — 数字输入

| 属性          | 类型                | 说明                 |
| ------------- | ------------------- | -------------------- |
| `label`       | `string`            | 标签                 |
| `placeholder` | `string`            | 占位文本             |
| `value`       | `number`            | 初始值               |
| `unit`        | `string`            | 单位                 |
| `min` / `max` | `number`            | 范围限制             |
| `step`        | `number`            | 步进值               |
| `binding`     | `string`            | **必填**。状态绑定键 |
| `interaction` | `InteractionPolicy` | 交互策略             |

### `textarea` — 多行文本

| 属性          | 类型                | 说明                 |
| ------------- | ------------------- | -------------------- |
| `label`       | `string`            | 标签                 |
| `placeholder` | `string`            | 占位文本             |
| `value`       | `string`            | 初始值               |
| `binding`     | `string`            | **必填**。状态绑定键 |
| `interaction` | `InteractionPolicy` | 交互策略             |

### `select` — 下拉选择

| 属性          | 类型                | 说明                 |
| ------------- | ------------------- | -------------------- |
| `label`       | `string`            | 标签                 |
| `value`       | `string`            | 选中值               |
| `binding`     | `string`            | **必填**。状态绑定键 |
| `options`     | `{label, value}[]`  | **必填**。选项列表   |
| `interaction` | `InteractionPolicy` | 交互策略             |

### `checkbox` — 复选框

| 属性          | 类型                | 说明                 |
| ------------- | ------------------- | -------------------- |
| `label`       | `string`            | **必填**。标签       |
| `checked`     | `boolean`           | **必填**。选中状态   |
| `binding`     | `string`            | **必填**。状态绑定键 |
| `interaction` | `InteractionPolicy` | 交互策略             |

### `slider` — 滑块

| 属性          | 类型                | 说明                 |
| ------------- | ------------------- | -------------------- |
| `label`       | `string`            | 标签                 |
| `value`       | `number`            | **必填**。当前值     |
| `min` / `max` | `number`            | **必填**。范围       |
| `step`        | `number`            | 步进值               |
| `unit`        | `string`            | 单位                 |
| `binding`     | `string`            | **必填**。状态绑定键 |
| `interaction` | `InteractionPolicy` | 交互策略             |

### `stepper` — 步进器

| 属性          | 类型                | 说明                 |
| ------------- | ------------------- | -------------------- |
| `label`       | `string`            | 标签                 |
| `value`       | `number`            | **必填**。当前值     |
| `binding`     | `string`            | **必填**。状态绑定键 |
| `min` / `max` | `number`            | 范围                 |
| `step`        | `number`            | 步进值               |
| `unit`        | `string`            | 单位                 |
| `interaction` | `InteractionPolicy` | 交互策略             |

### `external_link` — 外部链接

| 属性      | 类型     | 说明                                   |
| --------- | -------- | -------------------------------------- |
| `label`   | `string` | **必填**。显示文本                     |
| `url`     | `string` | **必填**。目标网址                     |
| `variant` | `enum`   | `primary` `secondary` `ghost` `danger` |

### `local_value_display` — 本地值展示

| 属性      | 类型     | 说明                                     |
| --------- | -------- | ---------------------------------------- |
| `label`   | `string` | 标签                                     |
| `binding` | `string` | **必填**。状态绑定键                     |
| `unit`    | `string` | 单位                                     |
| `format`  | `enum`   | `plain` `fixed_1` `fixed_2` `scientific` |

---

## 6. 数据可视化类 (Data Viz)

### `chart_bar` — 柱状图

| 属性                | 类型               | 说明           |
| ------------------- | ------------------ | -------------- |
| `title`             | `string`           | 图表标题       |
| `xLabel` / `yLabel` | `string`           | 坐标轴标签     |
| `data`              | `{label, value}[]` | **必填**。数据 |

### `chart_line` — 折线图

| 属性                | 类型       | 说明           |
| ------------------- | ---------- | -------------- |
| `title`             | `string`   | 图表标题       |
| `xLabel` / `yLabel` | `string`   | 坐标轴标签     |
| `data`              | `{x, y}[]` | **必填**。数据 |

### `gauge` — 仪表盘

| 属性          | 类型                          | 说明             |
| ------------- | ----------------------------- | ---------------- |
| `title`       | `string`                      | 标题             |
| `value`       | `number`                      | **必填**。当前值 |
| `min` / `max` | `number`                      | **必填**。范围   |
| `unit`        | `string`                      | 单位             |
| `thresholds`  | `{color, min, max, label?}[]` | 阈值区间         |
| `size`        | `enum`                        | `sm` `md` `lg`   |

### `kpi_card` — KPI 卡片

| 属性          | 类型               | 说明                                             |
| ------------- | ------------------ | ------------------------------------------------ |
| `title`       | `string`           | **必填**。标题                                   |
| `value`       | `string \| number` | **必填**。数值                                   |
| `unit`        | `string`           | 单位                                             |
| `trend`       | `enum`             | `up` `down` `stable`                             |
| `trendValue`  | `string`           | 趋势值                                           |
| `description` | `string`           | 描述                                             |
| `tone`        | `enum`             | `default` `primary` `success` `warning` `danger` |

### `stat_group` — 统计组

| 属性      | 类型                                               | 说明                       |
| --------- | -------------------------------------------------- | -------------------------- |
| `gap`     | `enum`                                             | `none` `xs` `sm` `md` `lg` |
| `columns` | `2-4`                                              | 列数                       |
| `items`   | `{id, label, value, unit?, trend?, trendValue?}[]` | **必填**。统计项           |

### `heatmap` — 热力图

| 属性                  | 类型         | 说明                                   |
| --------------------- | ------------ | -------------------------------------- |
| `title`               | `string`     | 标题                                   |
| `xLabels` / `yLabels` | `string[]`   | 坐标标签                               |
| `data`                | `number[][]` | **必填**。二维数据 (0-100)             |
| `colorScale`          | `enum`       | `blue` `green` `red` `yellow` `purple` |
| `cellSize`            | `enum`       | `sm` `md` `lg`                         |

### `radar_chart` — 雷达图

| 属性       | 类型                       | 说明               |
| ---------- | -------------------------- | ------------------ |
| `title`    | `string`                   | 标题               |
| `axes`     | `string[]`                 | **必填**。维度标签 |
| `series`   | `{name, values, color?}[]` | **必填**。数据系列 |
| `maxValue` | `number`                   | 最大值             |

### `color_swatch` — 色板

| 属性     | 类型                | 说明               |
| -------- | ------------------- | ------------------ |
| `title`  | `string`            | 标题               |
| `colors` | `{value, label?}[]` | **必填**。颜色列表 |
| `size`   | `enum`              | `sm` `md` `lg`     |

---

## 7. 复合组件类 (Composite)

### `panel` — 面板

| 属性       | 类型       | 说明                       |
| ---------- | ---------- | -------------------------- |
| `title`    | `string`   | 标题                       |
| `subtitle` | `string`   | 副标题                     |
| `gap`      | `enum`     | `none` `xs` `sm` `md` `lg` |
| `children` | `UINode[]` | 子节点                     |

### `tabs` — 标签页

| 属性          | 类型                      | 说明                       |
| ------------- | ------------------------- | -------------------------- |
| `activeTab`   | `string`                  | **必填**。当前激活标签 ID  |
| `gap`         | `enum`                    | `none` `xs` `sm` `md` `lg` |
| `tabs`        | `{id, label, children}[]` | **必填**。标签定义         |
| `interaction` | `InteractionPolicy`       | 交互策略                   |

### `modal` — 模态框

| 属性          | 类型       | 说明               |
| ------------- | ---------- | ------------------ |
| `title`       | `string`   | **必填**。标题     |
| `children`    | `UINode[]` | 子节点             |
| `closeIntent` | `string`   | **必填**。关闭意图 |

### `drawer` — 抽屉

| 属性          | 类型       | 说明                              |
| ------------- | ---------- | --------------------------------- |
| `title`       | `string`   | **必填**。标题                    |
| `side`        | `enum`     | **必填**。`left` `right` `bottom` |
| `children`    | `UINode[]` | 子节点                            |
| `closeIntent` | `string`   | **必填**。关闭意图                |

### `carousel` — 轮播

| 属性           | 类型       | 说明                       |
| -------------- | ---------- | -------------------------- |
| `title`        | `string`   | 标题                       |
| `gap`          | `enum`     | `none` `xs` `sm` `md` `lg` |
| `visibleItems` | `1-4`      | 每页可见项数               |
| `children`     | `UINode[]` | 子节点                     |

### `accordion` — 手风琴

| 属性               | 类型                      | 说明                       |
| ------------------ | ------------------------- | -------------------------- |
| `defaultOpenIndex` | `number`                  | 默认展开项索引 (-1 全折叠) |
| `gap`              | `enum`                    | `none` `xs` `sm` `md` `lg` |
| `items`            | `{id, title, children}[]` | **必填**。面板定义         |

### `empty_state` — 空状态

| 属性          | 类型              | 说明           |
| ------------- | ----------------- | -------------- |
| `icon`        | `string`          | 图标           |
| `title`       | `string`          | **必填**。标题 |
| `description` | `string`          | 描述           |
| `action`      | `{label, intent}` | CTA 按钮       |

---

## 8. 导航与反馈类 (Navigation & Feedback)

### `breadcrumb` — 面包屑

| 属性        | 类型               | 说明             |
| ----------- | ------------------ | ---------------- |
| `items`     | `{label, href?}[]` | **必填**。路径项 |
| `separator` | `enum`             | `/` `>` `›`      |

### `tag` — 标签

| 属性        | 类型      | 说明                                                    |
| ----------- | --------- | ------------------------------------------------------- |
| `text`      | `string`  | **必填**。标签文本                                      |
| `variant`   | `enum`    | `default` `primary` `success` `warning` `danger` `info` |
| `removable` | `boolean` | 是否可移除                                              |
| `size`      | `enum`    | `sm` `md`                                               |

### `list` — 列表

| 属性      | 类型                                       | 说明                       |
| --------- | ------------------------------------------ | -------------------------- |
| `ordered` | `boolean`                                  | 是否有序                   |
| `gap`     | `enum`                                     | `none` `xs` `sm` `md` `lg` |
| `items`   | `{id, text, description?, icon?, tone?}[]` | **必填**。列表项           |

### `description_list` — 描述列表

| 属性     | 类型                        | 说明                       |
| -------- | --------------------------- | -------------------------- |
| `gap`    | `enum`                      | `none` `xs` `sm` `md` `lg` |
| `layout` | `enum`                      | `vertical` `horizontal`    |
| `items`  | `{id, term, description}[]` | **必填**。键值对           |

### `steps` — 步骤条

| 属性        | 类型                                   | 说明                    |
| ----------- | -------------------------------------- | ----------------------- |
| `current`   | `number`                               | **必填**。当前步骤      |
| `direction` | `enum`                                 | `horizontal` `vertical` |
| `items`     | `{id, title, description?, status?}[]` | **必填**。步骤定义      |

### `alert` — 警告

| 属性      | 类型     | 说明                                          |
| --------- | -------- | --------------------------------------------- |
| `title`   | `string` | 标题                                          |
| `message` | `string` | **必填**。消息内容                            |
| `tone`    | `enum`   | **必填**。`info` `success` `warning` `danger` |

### `badge` — 徽标

| 属性      | 类型     | 说明                                                    |
| --------- | -------- | ------------------------------------------------------- |
| `text`    | `string` | **必填**。文本                                          |
| `variant` | `enum`   | `default` `primary` `success` `warning` `danger` `info` |
| `size`    | `enum`   | `sm` `md` `lg`                                          |

### `progress` — 进度条

| 属性    | 类型     | 说明                                             |
| ------- | -------- | ------------------------------------------------ |
| `label` | `string` | 标签                                             |
| `value` | `number` | **必填**。当前值                                 |
| `max`   | `number` | 最大值                                           |
| `unit`  | `string` | 单位                                             |
| `tone`  | `enum`   | `default` `primary` `success` `warning` `danger` |

### `statistic` — 统计卡

| 属性                | 类型               | 说明                 |
| ------------------- | ------------------ | -------------------- |
| `title`             | `string`           | **必填**。标题       |
| `value`             | `string \| number` | **必填**。数值       |
| `prefix` / `suffix` | `string`           | 前缀/后缀            |
| `trend`             | `enum`             | `up` `down` `stable` |
| `trendValue`        | `string`           | 趋势值               |
| `description`       | `string`           | 描述                 |

### `timeline` — 时间线

| 属性    | 类型                                                    | 说明               |
| ------- | ------------------------------------------------------- | ------------------ |
| `items` | `{id, title, description?, timestamp?, tone?, icon?}[]` | **必填**。时间线项 |

---

## 9. 运行时特殊组件 (Runtime)

### `clock` — 动态时钟

客户端实时更新，无需 AI 调用。

| 属性       | 类型     | 说明                           |
| ---------- | -------- | ------------------------------ |
| `format`   | `enum`   | `time` `date` `datetime` `iso` |
| `timezone` | `string` | IANA 时区                      |
| `interval` | `number` | 更新间隔(ms)                   |
| `label`    | `string` | 标签                           |
| `variant`  | `enum`   | `default` `mono` `large`       |

### `timer_refresh` — 计时触发刷新器

延迟后自动将当前 UI 回传 AI 重新生成。用于加载/思考中占位。

| 属性           | 类型      | 说明                       |
| -------------- | --------- | -------------------------- |
| `seconds`      | `number`  | **必填**。延迟秒数 (1-300) |
| `message`      | `string`  | 倒计时消息                 |
| `showProgress` | `boolean` | 是否显示进度条             |

---

## 10. 样式与交互系统

### 交互策略 (InteractionPolicy)

```typescript
{
  mode: "local" | "ai_transition" | "hybrid",
  commitOn?: ("blur" | "enter" | "change" | "click" | "submit")[],
  includeLocalStateOnCommit?: boolean,
  debounceMs?: number
}
```

- **local**: 仅本地交互，不触发 AI
- **ai_transition**: 交互后触发 AI 状态转换
- **hybrid**: 混合模式

### 本地动作 (LocalAction)

| 类型                      | 说明                                  |
| ------------------------- | ------------------------------------- |
| `increment` / `decrement` | 数值增减 (binding, step?, min?, max?) |
| `set_value`               | 设置指定值 (binding, value)           |
| `toggle`                  | 切换布尔值 (binding)                  |
| `append_text`             | 追加文本 (targetBinding, text)        |

### 语义角色 (SemanticRole)

| 角色                | 说明     |
| ------------------- | -------- |
| `navigation`        | 导航元素 |
| `input`             | 输入元素 |
| `analysis_action`   | 分析操作 |
| `local_adjustment`  | 本地调整 |
| `display`           | 展示元素 |
| `warning`           | 警告元素 |
| `confirmation`      | 确认元素 |
| `tool_result`       | 工具结果 |
| `simulation_result` | 模拟结果 |

---

## 11. 运行时约束

| 约束项               | 默认值                 | 说明             |
| -------------------- | ---------------------- | ---------------- |
| `maxNodes`           | 300                    | 最大节点数       |
| `maxDepth`           | 16                     | 最大嵌套深度     |
| `maxTextLength`      | 20000                  | 最大文本长度     |
| `allowExternalData`  | false                  | 是否允许外部数据 |
| `allowCodeExecution` | false                  | 是否允许代码执行 |
| `allowToolUse`       | false                  | 是否允许工具调用 |
| `styleSystem`        | `semantic_tokens_only` | 样式系统         |
| `maxGridColumns`     | 8                      | 最大网格列数     |
| `maxRegions`         | 16                     | 最大区域数       |

---

## 附录：组件速查表

| #   | type                  | 分类       | 说明           |
| --- | --------------------- | ---------- | -------------- |
| 1   | `screen`              | 布局       | 屏幕根节点     |
| 2   | `container`           | 布局       | 弹性容器       |
| 3   | `grid`                | 布局       | 网格容器       |
| 4   | `split`               | 布局       | 分栏布局       |
| 5   | `region`              | 布局       | 语义区域       |
| 6   | `toolbar`             | 布局       | 工具栏         |
| 7   | `spacer`              | 布局       | 间距           |
| 8   | `divider`             | 布局       | 分割线         |
| 9   | `panel`               | 复合       | 面板           |
| 10  | `heading`             | 内容       | 标题           |
| 11  | `text`                | 内容       | 文本           |
| 12  | `image`               | 内容       | 图片           |
| 13  | `metric`              | 内容       | 指标           |
| 14  | `code_block`          | 内容       | 代码块         |
| 15  | `table`               | 内容       | 表格           |
| 16  | `quote`               | 内容       | 引用块         |
| 17  | `card`                | 内容       | 增强卡片       |
| 18  | `button`              | 输入       | 按钮           |
| 19  | `text_input`          | 输入       | 文本输入       |
| 20  | `number_input`        | 输入       | 数字输入       |
| 21  | `textarea`            | 输入       | 多行文本       |
| 22  | `select`              | 输入       | 下拉选择       |
| 23  | `checkbox`            | 输入       | 复选框         |
| 24  | `slider`              | 输入       | 滑块           |
| 25  | `stepper`             | 输入       | 步进器         |
| 26  | `external_link`       | 输入       | 外部链接       |
| 27  | `local_value_display` | 运行时     | 本地值展示     |
| 28  | `tabs`                | 复合       | 标签页         |
| 29  | `modal`               | 复合       | 模态框         |
| 30  | `drawer`              | 复合       | 抽屉           |
| 31  | `carousel`            | 复合       | 轮播           |
| 32  | `accordion`           | 复合       | 手风琴         |
| 33  | `empty_state`         | 复合       | 空状态         |
| 34  | `chart_bar`           | 数据可视化 | 柱状图         |
| 35  | `chart_line`          | 数据可视化 | 折线图         |
| 36  | `gauge`               | 数据可视化 | 仪表盘         |
| 37  | `kpi_card`            | 数据可视化 | KPI 卡片       |
| 38  | `stat_group`          | 数据可视化 | 统计组         |
| 39  | `heatmap`             | 数据可视化 | 热力图         |
| 40  | `radar_chart`         | 数据可视化 | 雷达图         |
| 41  | `color_swatch`        | 数据可视化 | 色板           |
| 42  | `alert`               | 反馈       | 警告           |
| 43  | `badge`               | 反馈       | 徽标           |
| 44  | `progress`            | 反馈       | 进度条         |
| 45  | `statistic`           | 反馈       | 统计卡         |
| 46  | `timeline`            | 反馈       | 时间线         |
| 47  | `breadcrumb`          | 导航       | 面包屑         |
| 48  | `tag`                 | 导航       | 标签           |
| 49  | `list`                | 内容       | 列表           |
| 50  | `description_list`    | 内容       | 描述列表       |
| 51  | `steps`               | 导航       | 步骤条         |
| 52  | `clock`               | 运行时     | 动态时钟       |
| 53  | `timer_refresh`       | 运行时     | 计时触发刷新器 |

---

> **文件位置**: `docs/AUIR_UI_Elements_Summary.md`
