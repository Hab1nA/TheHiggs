// ============================================================
// POST /api/refine — 独立的 Prompt Refinement 端点
// ============================================================
// 接收用户简短查询，返回 AI 细化后的详细提示词。
// 可用于调试或在 Refine Mode 下独立验证细化效果。

import { isMockMode } from "@/ai/model";
import { refineUserQuery } from "@/ai/refinePrompt";
import { appendRuntimeLog, ensurePageLog } from "@/runtime/logging/server";
import type { PageLogContext } from "@/runtime/logging/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const refineRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  pageLogContext: z
    .object({
      pageLogId: z.string(),
      pageStartedAt: z.string(),
      sessionId: z.string().optional(),
      initialQuery: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
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
  const pageLogContext = parsed.data.pageLogContext;
  if (pageLogContext) {
    await ensurePageLog(pageLogContext);
  }

  // Check if mock mode — return a mock refinement
  if (isMockMode()) {
    const mockResult = {
      ok: true,
      mock: true,
      refinedPrompt: `[Mock Refine] 用户想要一个关于 "${parsed.data.query}" 的完整应用。请生成一个功能齐全、布局合理的界面，包含导航、主要内容区域和交互元素。`,
      appKind: "utility",
      appTitle: "Mock App",
      appDescription: "A mock refined application",
      keyFeatures: ["Feature 1", "Feature 2", "Feature 3"],
      suggestedLayout: "single column with header",
      suggestedComponents: ["heading", "text", "button", "input"],
    };
    await logRefineApi(pageLogContext, "success", { mock: true, mockResult });
    return NextResponse.json(mockResult);
  }

  try {
    const startedAt = Date.now();
    console.log(`[API /api/refine] Refining query: "${parsed.data.query}"`);
    const result = await refineUserQuery(parsed.data.query, pageLogContext);
    console.log(
      `[API /api/refine] Refine complete (${Date.now() - startedAt}ms):`,
      `kind=${result.appKind}, title="${result.appTitle}", features=${result.keyFeatures.length}`,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API /api/refine] Refine error:", message);
    await logRefineApi(pageLogContext, "failure", { error: message });
    return NextResponse.json(
      { ok: false, error: `Refinement failed: ${message}` },
      { status: 500 },
    );
  }
}

async function logRefineApi(
  context: PageLogContext | undefined,
  status: "success" | "failure",
  payload: unknown,
): Promise<void> {
  if (!context) return;
  await appendRuntimeLog({
    type: "api.refine.completed",
    pageLogId: context.pageLogId,
    sessionId: context.sessionId,
    stage: "refine",
    status,
    payload,
  });
}
