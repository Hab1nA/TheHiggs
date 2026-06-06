// ============================================================
// AUIR Fallback — Error / Fallback UI 生成
// ============================================================

import type { AUIRResponse, AUIRState } from "./types";

/** 生成 error fallback UI response */
export function createFallbackResponse(reason: string): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: createFallbackState(reason),
    diagnostics: {
      warnings: [`Fallback UI generated: ${reason}`],
      errors: [reason],
    },
  };
}

/** 生成 error fallback UI state */
export function createFallbackState(reason: string): AUIRState {
  return {
    app: {
      id: "error_app",
      title: "Runtime Error",
      kind: "unknown",
    },
    memory: {
      app: { error: reason },
      session: {},
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
          message:
            reason ||
            "The model returned an invalid UI state. Try another request.",
          semanticRole: "warning",
        },
        {
          id: "error_spacer",
          type: "spacer",
          size: "md",
        },
        {
          id: "restart_button",
          type: "button",
          label: "Start Over",
          intent: "restart_runtime",
          variant: "primary",
          semanticRole: "navigation",
          expectedEffect: "Return to launcher",
          interaction: {
            mode: "ai_transition",
            commitOn: ["click"],
          },
        },
      ],
    },
  };
}

/** 生成 launcher state（初始搜索页） */
export function createLauncherState(): AUIRState {
  return {
    app: {
      id: "launcher",
      title: "TheHiggs — AI-UI Co-Execution Runtime",
      kind: "launcher",
      description: "Search for or describe the app you want to launch.",
    },
    memory: {
      app: {},
      session: { view: "launcher" },
    },
    ui: {
      id: "launcher_screen",
      type: "screen",
      title: "TheHiggs",
      layoutMode: "single",
      children: [
        {
          id: "launcher_heading",
          type: "heading",
          text: "TheHiggs",
          level: 1,
          semanticRole: "display",
        },
        {
          id: "launcher_badges",
          type: "container",
          direction: "row",
          gap: "sm",
          children: [
            {
              id: "badge_v",
              type: "badge",
              text: "v0.3.1",
              variant: "primary",
              size: "sm",
            },
            {
              id: "badge_comp",
              type: "badge",
              text: "49 Components",
              variant: "success",
              size: "sm",
            },
          ],
        },
        {
          id: "launcher_subtitle",
          type: "text",
          text: "AI-UI Co-Execution Runtime — AI 驻留在自己生成的 UI 中",
          style: { tone: "muted" },
        },
        {
          id: "launcher_spacer",
          type: "spacer",
          size: "md",
        },
        {
          id: "launcher_quote",
          type: "quote",
          text: "Describe any tool you need — the AI designs and inhabits its interface.",
          tone: "muted",
        },
        {
          id: "launcher_spacer2",
          type: "spacer",
          size: "lg",
        },
        {
          id: "app_search_input",
          type: "text_input",
          label: "描述你想要的应用",
          placeholder: "例如：做一个火箭发动机循环参数分析工具...",
          binding: "app.searchQuery",
          semanticRole: "input",
          interaction: {
            mode: "ai_transition",
            commitOn: ["enter"],
          },
        },
        {
          id: "launcher_spacer3",
          type: "spacer",
          size: "md",
        },
        {
          id: "launcher_examples",
          type: "panel",
          title: "Try these examples",
          subtitle: "Click a preset or type your own idea",
          children: [
            {
              id: "examples_list",
              type: "list",
              gap: "xs",
              items: [
                {
                  id: "ex1",
                  text: "Dashboard with revenue metrics and user analytics",
                  icon: "📊",
                },
                {
                  id: "ex2",
                  text: "Project tracker with milestones and timeline",
                  icon: "📋",
                },
                {
                  id: "ex3",
                  text: "Health & fitness tracker with daily goals",
                  icon: "💪",
                },
                {
                  id: "ex4",
                  text: "Component showcase — see all 49 UI elements",
                  icon: "🎨",
                },
                {
                  id: "ex5",
                  text: "Code editor with syntax highlighting",
                  icon: "💻",
                },
                {
                  id: "ex6",
                  text: "Conversion funnel analytics with heatmaps",
                  icon: "📈",
                },
              ],
            },
          ],
        },
        {
          id: "launcher_tags",
          type: "container",
          direction: "row",
          gap: "sm",
          children: [
            {
              id: "tag_eng",
              type: "tag",
              text: "工程工具",
              variant: "primary",
              size: "sm",
            },
            {
              id: "tag_dash",
              type: "tag",
              text: "数据看板",
              variant: "success",
              size: "sm",
            },
            {
              id: "tag_prod",
              type: "tag",
              text: "生产力",
              variant: "warning",
              size: "sm",
            },
            {
              id: "tag_creative",
              type: "tag",
              text: "创意工具",
              variant: "info",
              size: "sm",
            },
          ],
        },
      ],
    },
  };
}
