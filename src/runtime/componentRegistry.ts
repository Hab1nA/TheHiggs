// ============================================================
// AUIR Component Registry — 类型安全的 UI 组件注册表
// ============================================================
// 替代 Renderer.tsx 中的巨型 if-else 链，
// 提供类型安全、可扩展的组件注册机制。
//
// 设计哲学：
//   TheHiggs 的 UI 组件是协议的物理实现。
//   每个组件类型对应一个渲染器，渲染器是协议到 DOM 的映射函数。
//   注册表模式使这个映射可扩展、可测试、可组合。
//
// 优势：
//   1. 类型安全 — 注册时即验证组件类型
//   2. 可扩展 — 第三方可注册自定义组件
//   3. 可测试 — 每个渲染器可独立测试
//   4. 可组合 — 支持高阶渲染器（装饰器模式）

import type { AUIREvent, LocalUIState, UINode } from "@/auir/types";
import React from "react";

// -----------------------------------------------------------
// 渲染器接口
// -----------------------------------------------------------

/** 渲染器接收的标准属性 */
export interface NodeRenderProps {
  /** 节点数据（已转为 Record 以便字段访问） */
  n: Record<string, unknown>;
  /** 原始类型化节点 */
  node: UINode;
  /** 当前本地状态 */
  localState: LocalUIState;
  /** 设置单个 binding 的值 */
  setLocalValue: (
    binding: string,
    value: unknown,
    meta?: ComponentInteractionMeta,
  ) => void;
  /** 触发 AI 事件 */
  onAIEvent: (event: AUIREvent) => void;
}

/** 简化的渲染器属性（仅需要节点数据） */
export interface SimpleRenderProps {
  n: Record<string, unknown>;
  node: UINode;
}

/** 本地视图渲染器属性（需要节点数据 + 本地状态） */
export interface LocalViewRenderProps {
  n: Record<string, unknown>;
  node: UINode;
  localState: LocalUIState;
}

/** 组件交互元数据 */
export interface ComponentInteractionMeta {
  componentId: string;
  componentType: string;
  label?: string;
  interactionMode?: string;
}

/** 组件渲染器类型 */
export type ComponentRenderer = React.ComponentType<NodeRenderProps>;

/** 简单组件渲染器（不需要交互） */
export type SimpleComponentRenderer = React.ComponentType<SimpleRenderProps>;

/** 本地视图组件渲染器（需要本地状态） */
export type LocalViewComponentRenderer =
  React.ComponentType<LocalViewRenderProps>;

// -----------------------------------------------------------
// 组件分类
// -----------------------------------------------------------

/** 组件分类枚举 */
export enum ComponentCategory {
  /** 布局容器（包含 children） */
  Layout = "layout",
  /** 组合容器（tabs, modal, drawer） */
  Composition = "composition",
  /** 内容展示（text, image, chart） */
  Content = "content",
  /** 交互控件（button, input, select） */
  Interactive = "interactive",
  /** 运行时组件（clock, timer_refresh） */
  Runtime = "runtime",
}

/** 注册的组件元信息 */
export interface ComponentRegistration {
  /** 组件类型标识 */
  type: string;
  /** 组件分类 */
  category: ComponentCategory;
  /** 渲染器 */
  renderer: ComponentRenderer;
  /** 是否需要 children */
  hasChildren: boolean;
  /** 是否为交互组件 */
  isInteractive: boolean;
  /** 组件描述（用于文档和调试） */
  description?: string;
}

// -----------------------------------------------------------
// 注册表实现
// -----------------------------------------------------------

class AUIRComponentRegistry {
  private registry = new Map<string, ComponentRegistration>();
  private fallbackRenderer: ComponentRenderer | null = null;

  /**
   * 注册一个组件渲染器。
   *
   * @param type 组件类型标识（如 "button", "text_input"）
   * @param renderer 渲染器组件
   * @param category 组件分类
   * @param options 可选配置
   */
  register(
    type: string,
    renderer: ComponentRenderer,
    category: ComponentCategory,
    options?: {
      hasChildren?: boolean;
      isInteractive?: boolean;
      description?: string;
    },
  ): void {
    this.registry.set(type, {
      type,
      category,
      renderer,
      hasChildren: options?.hasChildren ?? false,
      isInteractive: options?.isInteractive ?? false,
      description: options?.description,
    });
  }

  /**
   * 注册一个简单渲染器（自动包装为标准渲染器）。
   */
  registerSimple(
    type: string,
    renderer: SimpleComponentRenderer,
    category: ComponentCategory,
    options?: { description?: string },
  ): void {
    const WrappedRenderer: ComponentRenderer = ({ n, node }) =>
      React.createElement(renderer, { n, node });
    this.register(type, WrappedRenderer, category, {
      hasChildren: false,
      isInteractive: false,
      ...options,
    });
  }

  /**
   * 注册一个本地视图渲染器（自动包装为标准渲染器）。
   */
  registerLocalView(
    type: string,
    renderer: LocalViewComponentRenderer,
    category: ComponentCategory,
    options?: { description?: string },
  ): void {
    const WrappedRenderer: ComponentRenderer = ({ n, node, localState }) =>
      React.createElement(renderer, { n, node, localState });
    this.register(type, WrappedRenderer, category, {
      hasChildren: false,
      isInteractive: false,
      ...options,
    });
  }

  /**
   * 获取指定类型的渲染器。
   * 如果未注册，返回 fallback 渲染器或 null。
   */
  getRenderer(type: string): ComponentRenderer | null {
    return this.registry.get(type)?.renderer ?? this.fallbackRenderer;
  }

  /**
   * 获取组件的注册信息。
   */
  getRegistration(type: string): ComponentRegistration | null {
    return this.registry.get(type) ?? null;
  }

  /**
   * 设置 fallback 渲染器（用于未注册的组件类型）。
   */
  setFallback(renderer: ComponentRenderer): void {
    this.fallbackRenderer = renderer;
  }

  /**
   * 获取所有已注册的组件类型。
   */
  getRegisteredTypes(): string[] {
    return [...this.registry.keys()];
  }

  /**
   * 获取指定分类的所有组件。
   */
  getByCategory(category: ComponentCategory): ComponentRegistration[] {
    return [...this.registry.values()].filter((r) => r.category === category);
  }

  /**
   * 检查指定类型是否已注册。
   */
  has(type: string): boolean {
    return this.registry.has(type);
  }

  /**
   * 获取注册表统计信息。
   */
  getStats(): {
    total: number;
    byCategory: Record<string, number>;
    interactive: number;
    withChildren: number;
  } {
    const byCategory: Record<string, number> = {};
    let interactive = 0;
    let withChildren = 0;

    for (const reg of this.registry.values()) {
      byCategory[reg.category] = (byCategory[reg.category] ?? 0) + 1;
      if (reg.isInteractive) interactive++;
      if (reg.hasChildren) withChildren++;
    }

    return {
      total: this.registry.size,
      byCategory,
      interactive,
      withChildren,
    };
  }
}

// -----------------------------------------------------------
// 全局注册表实例
// -----------------------------------------------------------

/** 全局组件注册表 */
export const componentRegistry = new AUIRComponentRegistry();

// -----------------------------------------------------------
// 注册辅助函数
// -----------------------------------------------------------

/**
 * 批量注册组件。
 * 用于初始化时一次性注册所有内置组件。
 */
export function registerComponents(
  registrations: Array<{
    type: string;
    renderer: ComponentRenderer;
    category: ComponentCategory;
    options?: {
      hasChildren?: boolean;
      isInteractive?: boolean;
      description?: string;
    };
  }>,
): void {
  for (const reg of registrations) {
    componentRegistry.register(
      reg.type,
      reg.renderer,
      reg.category,
      reg.options,
    );
  }
}

/**
 * 获取组件的分类标签（用于调试面板）。
 */
export function getCategoryLabel(category: ComponentCategory): string {
  const labels: Record<ComponentCategory, string> = {
    [ComponentCategory.Layout]: "布局",
    [ComponentCategory.Composition]: "组合",
    [ComponentCategory.Content]: "内容",
    [ComponentCategory.Interactive]: "交互",
    [ComponentCategory.Runtime]: "运行时",
  };
  return labels[category] ?? category;
}
