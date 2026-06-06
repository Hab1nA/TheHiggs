// ============================================================
// POST /api/refine — 独立的 Prompt Refinement 端点
// ============================================================
// 接收用户简短查询，返回 AI 细化后的详细提示词。
// 可用于调试或在 Refine Mode 下独立验证细化效果。

import { isMockMode } from "@/ai/model";
import { refineUserQuery } from "@/ai/refinePrompt";
import { NextResponse } from "next/server";
import { z } from "zod";

const refineRequestSchema = z.object({
  query: z.string().min(1).max(1000),
});

export async function POST(req: Request): Promise<NextResponse> {
  // Check if mock mode — return a mock refinement
  if (isMockMode()) {
    return NextResponse.json({
      ok: true,
      mock: true,
      refinedPrompt: `[Mock Refine] 用户想要一个关于 "${""}" 的完整应用。请生成一个功能齐全、布局合理的界面，包含导航、主要内容区域和交互元素。`,
      appKind: "utility",
      appTitle: "Mock App",
      appDescription: "A mock refined application",
      keyFeatures: ["Feature 1", "Feature 2", "Feature 3"],
      suggestedLayout: "single column with header",
      suggestedComponents: ["heading", "text", "button", "input"],
    });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = refineRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await refineUserQuery(parsed.data.query);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API /api/refine] Refine error:", message);
    return NextResponse.json(
      { ok: false, error: `Refinement failed: ${message}` },
      { status: 500 },
    );
  }
}
