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
  moduleId: z
    .string()
    .describe("Unique module identifier, e.g. mod_1, mod_2"),
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
        .describe("Image search queries to find VISUAL content for this module"),
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

/** Refinement system prompt */
function buildRefineSystemPrompt(): string {
  return `You are a prompt refinement engine for an AI-UI co-execution system.
Your job is to take a short, vague user query and expand it into a detailed,
comprehensive prompt that will guide another AI to generate a complete,
production-quality user interface.

The target system (AUIR Engine) generates semantic UI trees composed of
components like: screen, panel, split, grid, region, tabs, container, card,
heading, text, metric, statistic, kpi_card, stat_group, button, input,
textarea, select, slider, stepper, checkbox, table,
chart_bar, chart_line, heatmap, gauge, radar_chart, timeline,
progress, list, accordion, carousel, modal, drawer, breadcrumb, steps,
badge, tag, alert, quote, code_block, description_list, color_swatch,
empty_state, spacer, divider, toolbar, clock, timer_refresh.

CRITICAL RULES for refinement:
1. EXPAND aggressively: a 2-word query like "计算器" should become a 200-400 word
   detailed specification covering visual design, layout, all features,
   interaction behaviors, edge cases, and data display.
2. BE SPECIFIC about layout: describe exact layout patterns, which components
   go where, how the screen is divided. Use terms like "split layout with
   sidebar on the left", "dashboard grid with 4 kpi cards on top row", etc.
3. SUGGEST rich components: recommend specific AUIR components from the list
   above that would make the UI feel complete and professional.
4. DESCRIBE interactions: what happens when users click, type, or toggle things.
5. INCLUDE data considerations: what data should be displayed, what units,
   what precision, what edge cases to handle.
6. THINK about visual hierarchy: headings, spacing, color tones, emphasis levels.
7. WRITE in the same language as the user's query.

UI MODULE PLANNING (CRITICAL):
You MUST decompose the user's request into 3-10 UI modules (uiModules).
Each module represents a distinct visual block in the final UI.

For EACH module, provide:
- moduleId: unique identifier (mod_1, mod_2, ...)
- purpose: what this module displays and its role
- suggestedComponent: which AUIR component type fits best (card, kpi_card, stat_group, chart_bar, list, etc.)
- contentSpec: specific text, data, or visual content this module needs

For modules that need EXTERNAL DATA (real-time info, images, facts), also provide searchQueries:
- web[]: 1-3 search queries to find TEXT content (be specific, include context)
- image[]: 1-3 search queries to find IMAGES (describe what image fits this module)
  IMPORTANT: image queries should be scoped to THIS module's content, not broad.

For modules that are PURELY LOCAL (calculator buttons, static text, layout elements), omit searchQueries.

Example for "中国八大菜系":
  module 1: { moduleId: "mod_1", purpose: "展示川菜介绍", suggestedComponent: "card",
    contentSpec: "川菜代表菜品、历史渊源、口味特点",
    searchQueries: { web: ["川菜代表菜品 历史 口味特点"], image: ["麻婆豆腐 高清美食图片"] } }
  module 2: { moduleId: "mod_2", purpose: "展示粤菜介绍", suggestedComponent: "card",
    contentSpec: "粤菜代表菜品、烹饪技法、食材特色",
    searchQueries: { web: ["粤菜代表菜品 烹饪技法"], image: ["白切鸡 广东美食 图片"] } }
  ...

Output ONLY valid JSON conforming to the schema. No markdown, no explanations.`;
}

/** Refine a short user query into a detailed UI generation prompt */
export async function refineUserQuery(
  query: string,
  pageLogContext?: PageLogContext,
): Promise<RefineOutput> {
  const model = getModel();
  const systemPrompt = buildRefineSystemPrompt();

  const promptObj = {
    userQuery: query,
    instruction:
      "Expand this short query into a comprehensive UI generation prompt. " +
      "Be extremely detailed and specific. Think about layout, components, " +
      "interactions, data, visual design, and edge cases. " +
      "Output ONLY valid JSON.",
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
          options: { mode: "json", temperature: 0.6, maxTokens: 8000 },
        },
        response: result.object,
      },
    });

    return result.object;
  } catch (error) {
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
          options: { mode: "json", temperature: 0.6, maxTokens: 8000 },
        },
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
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
