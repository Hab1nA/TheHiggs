// ============================================================
// AUIR Transition Animations — 语义过渡动画协议
// ============================================================
// 为 AI 生成的 UI 状态转移提供语义化过渡动画。
//
// 设计哲学：
//   状态转移是 TheHiggs 的核心操作。每一次 AI 返回新 UI，
//   都是一次语义状态跳变。无动画的跳变让用户失去上下文感知，
//   过度动画则让界面感觉迟钝。
//   过渡动画应该是语义的——告诉用户"什么变了"，而非仅仅"变了"。
//
// 动画分类：
//   1. 内容更新 — 淡入淡出（数据刷新、图表更新）
//   2. 布局变化 — 滑入滑出（tab 切换、面板展开）
//   3. 状态反馈 — 脉冲/闪烁（错误、成功、加载）
//   4. 进入/退出 — 缩放渐变（modal、drawer）
//
// 实现策略：
//   在 UINode 的 style 字段中增加 transition 属性，
//   Renderer 根据 transition 类型应用 CSS transition/animation。

import type { TransitionConfig, UINode } from "./types";

// Re-export for consumers that import from transitions.ts
export type {
  TransitionConfig,
  TransitionDirection,
  TransitionType,
} from "./types";

// -----------------------------------------------------------
// 语义过渡映射
// -----------------------------------------------------------

/** 根据节点类型和上下文推断合适的过渡动画 */
export function inferTransition(
  node: UINode,
  context: {
    /** 是否为首次渲染 */
    isFirstRender?: boolean;
    /** 是否为搜索结果更新 */
    isSearchResult?: boolean;
    /** 是否为错误状态 */
    isError?: boolean;
    /** 是否为加载状态 */
    isLoading?: boolean;
    /** 上一个节点类型（用于判断变化类型） */
    previousType?: string;
  },
): TransitionConfig | null {
  const rec = node as Record<string, unknown>;
  const type = rec.type as string;

  // 加载状态 → 骨架屏
  if (context.isLoading) {
    return { type: "skeleton", duration: 300 };
  }

  // 错误状态 → 脉冲
  if (context.isError) {
    return { type: "pulse", duration: 500 };
  }

  // Modal/Drawer 进入 → 缩放
  if (type === "modal" || type === "drawer") {
    return {
      type: context.isFirstRender ? "scale-in" : "fade-in",
      duration: 200,
      easing: "ease-out",
    };
  }

  // Tab 内容切换 → 滑入
  if (type === "tabs") {
    return { type: "slide-in", direction: "left", duration: 150 };
  }

  // Alert 出现 → 脉冲
  if (type === "alert") {
    return { type: "pulse", duration: 400 };
  }

  // Metric/Statistic 更新 → 数值变形
  if (type === "metric" || type === "statistic" || type === "kpi_card") {
    return { type: "number-morph", duration: 300, easing: "ease-out" };
  }

  // 搜索结果更新 → 淡入
  if (context.isSearchResult) {
    return { type: "fade-in", duration: 200 };
  }

  // 默认：首次渲染淡入
  if (context.isFirstRender) {
    return { type: "fade-in", duration: 150 };
  }

  return null;
}

// -----------------------------------------------------------
// CSS 类名映射
// -----------------------------------------------------------

/** 将 TransitionConfig 转换为 Tailwind CSS 类名 */
export function transitionToClasses(config: TransitionConfig): string {
  const durationClass = durationToTailwind(config.duration ?? 200);
  const easingClass = easingToTailwind(config.easing ?? "ease-out");
  const delayClass =
    config.delay && config.delay > 0
      ? `delay-${Math.min(config.delay, 1000)}`
      : "";

  const base = `${durationClass} ${easingClass} ${delayClass}`.trim();

  switch (config.type) {
    case "fade-in":
      return `animate-fade-in ${base}`;
    case "fade-out":
      return `animate-fade-out ${base}`;
    case "slide-in":
      return `animate-slide-${config.direction ?? "left"}-in ${base}`;
    case "slide-out":
      return `animate-slide-${config.direction ?? "right"}-out ${base}`;
    case "scale-in":
      return `animate-scale-in ${base}`;
    case "scale-out":
      return `animate-scale-out ${base}`;
    case "pulse":
      return `animate-pulse ${base}`;
    case "skeleton":
      return `animate-pulse bg-neutral-800 rounded ${base}`;
    case "number-morph":
      return `transition-all ${base}`;
    case "none":
      return "";
    default:
      return "";
  }
}

/** 持续时间转 Tailwind 类 */
function durationToTailwind(ms: number): string {
  if (ms <= 100) return "duration-100";
  if (ms <= 150) return "duration-150";
  if (ms <= 200) return "duration-200";
  if (ms <= 300) return "duration-300";
  if (ms <= 500) return "duration-500";
  if (ms <= 700) return "duration-700";
  return "duration-1000";
}

/** 缓动函数转 Tailwind 类 */
function easingToTailwind(easing: string): string {
  switch (easing) {
    case "ease":
      return "ease";
    case "ease-in":
      return "ease-in";
    case "ease-out":
      return "ease-out";
    case "ease-in-out":
      return "ease-in-out";
    case "linear":
      return "ease-linear";
    default:
      return "ease-out";
  }
}

// -----------------------------------------------------------
// 过渡 CSS 变量（内联样式用）
// -----------------------------------------------------------

/** 将 TransitionConfig 转换为 CSS 内联样式变量 */
export function transitionToStyle(
  config: TransitionConfig,
): Record<string, string> {
  if (config.type === "none") return {};

  const duration = config.duration ?? 200;
  const easing = config.easing ?? "ease-out";
  const delay = config.delay ?? 0;

  return {
    transition: `all ${duration}ms ${easing} ${delay}ms`,
  };
}
