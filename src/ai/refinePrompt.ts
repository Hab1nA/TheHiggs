// ============================================================
// AI Prompt Refinement — 用户简短输入 → AI 细化提示词
// ============================================================
// 当用户开启 "Refine Mode" 时，先调用此模块将简短查询（如"计算器"）
// 细化为包含详细功能、布局、交互需求的完整提示词，
// 然后再将细化后的提示词注入 AUIR 生成流程。

import { appendRuntimeLog } from "@/runtime/logging/server";
import type { PageLogContext } from "@/runtime/logging/types";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./model";

// -----------------------------------------------------------
// UI Module Plan Schema — 框架规划
// -----------------------------------------------------------

/** 单个 UI 模块的规划结构 */
export const uiModulePlanSchema = z.object({
  moduleId: z.string().describe("Unique module identifier, e.g. mod_1, mod_2"),
  purpose: z
    .string()
    .describe(
      "What this module displays and its role in the app, e.g. '展示北京天气数据和图标'",
    ),
  suggestedComponent: z
    .string()
    .describe(
      "Primary AUIR component type for this module, e.g. card, kpi_card, stat_group, chart_bar",
    ),
  contentSpec: z
    .string()
    .describe(
      "Specific text/data content this module needs, e.g. '显示城市名、温度、湿度、风速、天气图标'",
    ),
  searchQueries: z
    .object({
      web: z
        .array(z.string())
        .min(0)
        .max(3)
        .optional()
        .describe("Web search queries to find TEXT content for this module"),
      image: z
        .array(z.string())
        .min(0)
        .max(3)
        .optional()
        .describe(
          "Image search queries to find VISUAL content for this module",
        ),
    })
    .optional()
    .describe(
      "Search queries scoped to this module's content needs. Omit for purely local modules.",
    ),
});

export type UIModulePlan = z.infer<typeof uiModulePlanSchema>;

// -----------------------------------------------------------
// Refine Output Schema
// -----------------------------------------------------------

/** Refine 输出 schema */
const refineOutputSchema = z.object({
  refinedPrompt: z
    .string()
    .describe("The elaborated, detailed prompt for UI generation"),
  appKind: z
    .enum([
      "utility",
      "engineering_tool",
      "creative_tool",
      "productivity_tool",
      "simulation",
      "dashboard",
      "unknown",
    ])
    .describe("The inferred app kind"),
  appTitle: z.string().describe("A short, catchy title for the app"),
  appDescription: z.string().describe("A one-sentence description of the app"),
  keyFeatures: z
    .array(z.string())
    .describe("3-5 key features the app should have"),
  suggestedLayout: z
    .string()
    .describe(
      "Suggested layout pattern, e.g. 'split with sidebar', 'dashboard grid', 'single column wizard'",
    ),
  suggestedComponents: z
    .array(z.string())
    .describe("5-10 specific UI components that would be useful"),
  uiModules: z
    .array(uiModulePlanSchema)
    .min(1)
    .max(12)
    .describe(
      "Planned UI modules with per-module content specs and search queries. " +
        "Each module represents a distinct visual block in the final UI. " +
        "Modules that need external data MUST provide searchQueries.",
    ),
});

export type RefineOutput = z.infer<typeof refineOutputSchema>;

function inferAppKind(query: string): RefineOutput["appKind"] {
  const normalized = query.toLowerCase();
  if (/天气|weather|forecast|气象/.test(query)) return "dashboard";
  if (/计算器|calculator|算/.test(query)) return "utility";
  if (/项目|task|todo|计划|追踪|管理/.test(query)) return "productivity_tool";
  if (/图表|数据|分析|dashboard|看板|metric|报表/.test(query)) {
    return "dashboard";
  }
  if (/设计|创作|生成|写作|文案|story|小说|插画/.test(query)) {
    return "creative_tool";
  }
  if (/开发|工程|代码|api|debug|测试|工具/.test(query)) {
    return "engineering_tool";
  }
  if (normalized.includes("simulat") || /模拟|演示|仿真/.test(query)) {
    return "simulation";
  }
  return "unknown";
}

function buildFallbackRefineOutput(query: string): RefineOutput {
  const trimmed = query.trim() || "应用";
  const appKind = inferAppKind(trimmed);
  const titleBase = trimmed.length > 18 ? `${trimmed.slice(0, 18)}…` : trimmed;
  const appTitle = `${titleBase} 细化版`;

  const layoutByKind: Record<RefineOutput["appKind"], string> = {
    utility:
      "single-column workspace with a compact control panel and result area",
    engineering_tool:
      "split layout with editor-style controls on the left and output panels on the right",
    creative_tool:
      "hero section plus layered workspace with a preview canvas and settings sidebar",
    productivity_tool:
      "dashboard grid with a task summary header, main work area, and supporting sidebar",
    simulation:
      "split layout with parameter controls, live simulation stage, and results summary",
    dashboard:
      "dashboard grid with summary cards on top and detailed analytics sections below",
    unknown:
      "responsive split layout with a clear header, main content area, and supporting panels",
  };

  const featureByKind: Record<RefineOutput["appKind"], string[]> = {
    utility: [
      "输入参数并即时计算结果",
      "显示清晰的结果卡片",
      "保留历史记录",
      "提供重置与复制操作",
    ],
    engineering_tool: [
      "展示核心输入参数",
      "提供可执行的操作按钮",
      "显示结果与错误状态",
      "支持调试/重试流程",
    ],
    creative_tool: [
      "提供主题输入与风格选择",
      "生成可预览的创作结果",
      "支持局部调整",
      "保存草稿与版本",
    ],
    productivity_tool: [
      "展示任务概览",
      "支持快速筛选和状态切换",
      "显示优先级与截止时间",
      "提供新增与归档操作",
    ],
    simulation: [
      "配置模拟参数",
      "运行并观察变化",
      "展示关键指标",
      "支持暂停、重置和对比",
    ],
    dashboard: [
      "展示核心指标",
      "提供趋势分析",
      "支持筛选和切换视图",
      "显示明细列表",
    ],
    unknown: [
      "展示主要目标",
      "提供基础交互控件",
      "显示结果摘要",
      "支持重试和重置",
    ],
  };

  const componentByKind: Record<RefineOutput["appKind"], string[]> = {
    utility: [
      "heading",
      "text_input",
      "number_input",
      "button",
      "metric",
      "card",
    ],
    engineering_tool: [
      "heading",
      "textarea",
      "button",
      "card",
      "code_block",
      "alert",
    ],
    creative_tool: ["heading", "select", "textarea", "button", "image", "card"],
    productivity_tool: [
      "heading",
      "select",
      "checkbox",
      "button",
      "table",
      "timeline",
    ],
    simulation: [
      "heading",
      "slider",
      "select",
      "button",
      "metric",
      "chart_line",
    ],
    dashboard: [
      "heading",
      "metric",
      "chart_bar",
      "chart_line",
      "table",
      "card",
    ],
    unknown: ["heading", "text", "button", "card", "table", "metric"],
  };

  const modulePrefix = appKind === "unknown" ? "generic" : appKind;
  const uiModules: RefineOutput["uiModules"] = [
    {
      moduleId: `${modulePrefix}_mod_1`,
      purpose: "展示应用标题、目标和关键摘要信息",
      suggestedComponent: "card",
      contentSpec: `显示“${trimmed}”的核心目标、使用场景和一段简短说明。`,
    },
    {
      moduleId: `${modulePrefix}_mod_2`,
      purpose: "提供主要交互和参数配置入口",
      suggestedComponent: componentByKind[appKind][1] ?? "button",
      contentSpec:
        "包含最重要的输入项、筛选项或操作按钮，用户可以在此调整主要参数。",
    },
    {
      moduleId: `${modulePrefix}_mod_3`,
      purpose: "展示结果、趋势或辅助信息",
      suggestedComponent: componentByKind[appKind][4] ?? "table",
      contentSpec:
        "展示计算结果、统计摘要、趋势信息或明细内容，并保留状态反馈。",
    },
  ];

  const parsed = refineOutputSchema.safeParse({
    refinedPrompt: `用户想要一个围绕"${trimmed}"的完整应用。请生成一个结构清晰、交互完整、视觉层次明确的界面。优先使用模块化布局，将页面拆成标题区、核心操作区和结果展示区。确保控件命名直观、状态反馈清楚，并且为用户保留重置、切换和查看明细的能力。`,
    appKind,
    appTitle,
    appDescription: `为"${trimmed}"构建的细化应用说明，强调清晰布局、可操作性和结果可读性。`,
    keyFeatures: featureByKind[appKind],
    suggestedLayout: layoutByKind[appKind],
    suggestedComponents: componentByKind[appKind],
    uiModules,
  });

  if (!parsed.success) {
    console.error(
      "[buildFallbackRefineOutput] Schema validation failed:",
      parsed.error.issues,
    );
    throw new Error(
      `Fallback refine output failed schema validation: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}

/** Last-resort minimal refine output when even the fallback fails */
function buildMinimalRefineOutput(query: string): RefineOutput {
  const trimmed = query.trim() || "应用";
  return {
    refinedPrompt: `用户想要一个关于"${trimmed}"的应用。请生成一个结构清晰的界面。`,
    appKind: "unknown" as const,
    appTitle: `${trimmed.length > 18 ? `${trimmed.slice(0, 18)}…` : trimmed} 应用`,
    appDescription: `为"${trimmed}"构建的应用。`,
    keyFeatures: ["展示主要目标", "提供基础交互控件", "显示结果摘要"],
    suggestedLayout: "single column with header and main content area",
    suggestedComponents: ["heading", "text", "button", "card"],
    uiModules: [
      {
        moduleId: "generic_mod_1",
        purpose: "展示应用标题和核心内容",
        suggestedComponent: "card",
        contentSpec: `显示"${trimmed}"的核心内容。`,
      },
    ],
  };
}

/** Refinement system prompt */
function buildRefineSystemPrompt(): string {
  return `You are a prompt refinement engine for an AI-UI co-execution system.
Your job is to take a short, vague user query and expand it into a detailed,
comprehensive prompt that will guide another AI to generate a complete,
production-quality user interface.

The target system (AUIR Engine) generates semantic UI trees composed of
runtime-defined UI components (the allowed set is provided at generation time via constraints).
Do not assume an exhaustive static list; prefer common structural/interactive types and let the runtime validate.

CRITICAL RULES for refinement:
1. EXPAND aggressively: a 2-word query like "计算器" should become a 200-400 word
   detailed specification covering visual design, layout, all features,
   interaction behaviors, edge cases, and data display.
2. BE SPECIFIC about layout: describe exact layout patterns, which components
   go where, how the screen is divided. Use terms like "split layout with
   sidebar on the left", "dashboard grid with 4 kpi cards on top row", etc.
3. SUGGEST rich components: recommend AUIR component types that would make the UI feel complete and professional (the runtime will constrain to the allowed set).
4. DESCRIBE interactions: what happens when users click, type, or adjust controls.
   MAXIMIZE INTERACTION: include at least 3-4 interactive modules (with buttons, inputs, sliders, selects, checkboxes). Interactive controls make the UI a living application, not a static page.
5. PRIORITIZE IMAGERY: for any topic involving visual subjects (food, places, products, animals, nature, architecture, people, events), plan image search queries for at least 2-3 modules.
6. INCLUDE data considerations: what data should be displayed, what units,
   what precision, what edge cases to handle.
7. THINK about visual hierarchy: headings, spacing, color tones, emphasis levels.
8. WRITE in the same language as the user's query.

UI MODULE PLANNING (CRITICAL):
You MUST decompose the user's request into 3-10 UI modules (uiModules).
Each module represents a distinct visual block in the final UI.

For EACH module, provide:
- moduleId: unique identifier (mod_1, mod_2, ...)
- purpose: what this module displays and its role
- suggestedComponent: which AUIR component type fits best
- contentSpec: specific text, data, or visual content this module needs

For modules that need EXTERNAL DATA (real-time info, images, facts), also provide searchQueries:
- web[]: 1-3 search queries to find TEXT content
- image[]: 1-3 search queries to find IMAGES

For modules that are PURELY LOCAL (calculator buttons, static text, layout elements), omit searchQueries.

Example:
  { moduleId: "mod_1", purpose: "...", suggestedComponent: "card", contentSpec: "...", searchQueries: { web: ["..."], image: ["..."] } }

Output ONLY valid JSON conforming to the schema.`;
}

/** Refine a short user query into a detailed UI generation prompt */
export async function refineUserQuery(
  query: string,
  pageLogContext?: PageLogContext,
  thinking?: boolean,
): Promise<RefineOutput> {
  const model = getModel(
    thinking === true ? "enabled" : thinking === false ? "disabled" : undefined,
  );
  const systemPrompt = buildRefineSystemPrompt();

  const promptObj = {
    userQuery: query,
    instruction:
      "Expand this short query into a comprehensive UI generation prompt. " +
      "Output ONLY valid JSON conforming to the refine schema.",
  };
  const startedAt = Date.now();

  try {
    const result = await generateObject({
      model,
      schema: refineOutputSchema,
      system: systemPrompt,
      prompt: JSON.stringify(promptObj),
      mode: "json",
      temperature: 0.6,
      maxTokens: 8000,
      // Retry on schema mismatch — LLM output quality is non-deterministic
      // and a single retry often produces valid JSON.
      maxRetries: 2,
    });

    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: pageLogContext?.sessionId,
      stage: "refine",
      status: "success",
      durationMs: Date.now() - startedAt,
      payload: {
        request: {
          system: systemPrompt,
          prompt: promptObj,
          options: {
            mode: "json",
            temperature: 0.6,
            maxTokens: 8000,
            maxRetries: 2,
          },
        },
        response: result.object,
      },
    });

    return result.object;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[refineUserQuery] LLM refine failed:", errorMessage);

    await appendRuntimeLog({
      type: "ai.exchange",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: pageLogContext?.sessionId,
      stage: "refine",
      status: "failure",
      durationMs: Date.now() - startedAt,
      payload: {
        request: {
          system: systemPrompt,
          prompt: promptObj,
          options: {
            mode: "json",
            temperature: 0.6,
            maxTokens: 8000,
            maxRetries: 2,
          },
        },
        error: errorMessage,
      },
    });

    // Build fallback — wrap in its own try-catch so that a Zod validation
    // failure in the fallback path cannot propagate up to the API route
    // handler (which would cause a 500 instead of a graceful 200+fallback).
    try {
      const fallback = buildFallbackRefineOutput(query);
      console.log(
        "[refineUserQuery] Using fallback refine output:",
        `kind=${fallback.appKind}, title="${fallback.appTitle}"`,
      );
      return fallback;
    } catch (fallbackError) {
      const fallbackMessage =
        fallbackError instanceof Error
          ? fallbackError.message
          : String(fallbackError);
      console.error(
        "[refineUserQuery] Fallback build also failed:",
        fallbackMessage,
      );
      // Last-resort: return a minimal valid RefineOutput
      return buildMinimalRefineOutput(query);
    }
  }
}

/** Build an enhanced AUIR system prompt supplement from refinement output */
export function buildRefinementSupplement(refine: RefineOutput): string {
  let supplement = `
--- REFINED APP SPECIFICATION (use this to guide your UI generation) ---
App Title: ${refine.appTitle}
App Kind: ${refine.appKind}
App Description: ${refine.appDescription}

Key Features:
${refine.keyFeatures.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}

Suggested Layout: ${refine.suggestedLayout}

Suggested Components: ${refine.suggestedComponents.join(", ")}

Refined Generation Prompt:
${refine.refinedPrompt}`;

  // Add UI framework plan if available
  if (refine.uiModules && refine.uiModules.length > 0) {
    supplement += `

UI FRAMEWORK PLAN — The UI has been pre-planned with ${refine.uiModules.length} modules.
You MUST create corresponding UI nodes for each module listed below.
Tool results (if any) are grouped by module — use them to populate each module's content.
${refine.uiModules
  .map(
    (m, i) =>
      `  ${i + 1}. [${m.moduleId}] ${m.purpose} → suggested: ${m.suggestedComponent} → content: ${m.contentSpec}`,
  )
  .join("\n")}`;
  }

  supplement += `
--- END REFINED APP SPECIFICATION ---`;
  return supplement;
}
