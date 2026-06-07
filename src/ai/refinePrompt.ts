// ============================================================
// AI Prompt Refinement — 用户简短输入 → AI 细化提示词
// ============================================================
// 当用户开启 "Refine Mode" 时，先调用此模块将简短查询（如"计算器"）
// 细化为包含详细功能、布局、交互需求的完整提示词，
// 然后再将细化后的提示词注入 AUIR 生成流程。

import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./model";

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
textarea, select, slider, stepper, checkbox, toggle, radio_group, table,
chart_bar, chart_line, chart_pie, heatmap, gauge, radar_chart, timeline,
progress, list, accordion, carousel, modal, drawer, breadcrumb, steps,
badge, tag, alert, quote, code_block, description_list, color_swatch,
empty_state, spacer, divider, toolbar.

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

Output ONLY valid JSON conforming to the schema. No markdown, no explanations.`;
}

/** Refine a short user query into a detailed UI generation prompt */
export async function refineUserQuery(query: string): Promise<RefineOutput> {
  const model = getModel();

  const promptObj = {
    userQuery: query,
    instruction:
      "Expand this short query into a comprehensive UI generation prompt. " +
      "Be extremely detailed and specific. Think about layout, components, " +
      "interactions, data, visual design, and edge cases. " +
      "Output ONLY valid JSON.",
  };

  const result = await generateObject({
    model,
    schema: refineOutputSchema,
    system: buildRefineSystemPrompt(),
    prompt: JSON.stringify(promptObj),
    mode: "json",
    temperature: 0.6,
    maxTokens: 8000,
  });

  return result.object;
}

/** Build an enhanced AUIR system prompt supplement from refinement output */
export function buildRefinementSupplement(refine: RefineOutput): string {
  return `
--- REFINED APP SPECIFICATION (use this to guide your UI generation) ---
App Title: ${refine.appTitle}
App Kind: ${refine.appKind}
App Description: ${refine.appDescription}

Key Features:
${refine.keyFeatures.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}

Suggested Layout: ${refine.suggestedLayout}

Suggested Components: ${refine.suggestedComponents.join(", ")}

Refined Generation Prompt:
${refine.refinedPrompt}
--- END REFINED APP SPECIFICATION ---
`;
}
