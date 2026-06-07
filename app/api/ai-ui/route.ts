// ============================================================
// POST /api/ai-ui — 核心 AI Runtime Endpoint
// ============================================================
// 接收 AUIRRequest，调用 AI Runtime，返回 AUIRResponse。

import { runAIRuntime } from "@/ai/runtime";
import { createFallbackResponse } from "@/auir/fallback";
import type { AUIRRequest, AUIRResponse } from "@/auir/types";
import { validateRequest } from "@/auir/validate";
import { appendRuntimeLog, ensurePageLog } from "@/runtime/logging/server";
import type { PageLogContext } from "@/runtime/logging/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse<AUIRResponse>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(createFallbackResponse("Invalid JSON body"), {
      status: 400,
    });
  }

  // Validate request
  const validation = validateRequest(json);
  if (!validation.ok) {
    return NextResponse.json(
      createFallbackResponse(
        `Invalid AUIRRequest: ${validation.errors.join("; ")}`,
      ),
      { status: 400 },
    );
  }

  const request = validation.value;
  const pageLogContext = getPageLogContext(request);
  if (pageLogContext) {
    await ensurePageLog(pageLogContext);
    await appendRuntimeLog({
      type: "api.ai_ui.request.received",
      pageLogId: pageLogContext.pageLogId,
      sessionId: request.session.sessionId,
      turn: request.session.turn,
      stage: "api",
      status: "success",
      payload: { request },
    });
  }
  const startedAt = Date.now();

  try {
    const response = await runAIRuntime(request);
    await appendRuntimeLog({
      type: "api.ai_ui.response.sent",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request.session.sessionId,
      turn: request.session.turn,
      stage: "api",
      status: "success",
      durationMs: Date.now() - startedAt,
      payload: { response },
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("[API /api/ai-ui] Runtime error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown runtime error";
    await appendRuntimeLog({
      type: "api.ai_ui.runtime.error",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request.session.sessionId,
      turn: request.session.turn,
      stage: "api",
      status: "failure",
      durationMs: Date.now() - startedAt,
      payload: { error: message },
    });
    return NextResponse.json(
      createFallbackResponse(`AI runtime failed: ${message}`),
      { status: 500 },
    );
  }
}

function getPageLogContext(request: AUIRRequest): PageLogContext | null {
  if (!request.session.pageLogId || !request.session.pageStartedAt) return null;
  return {
    pageLogId: request.session.pageLogId,
    pageStartedAt: request.session.pageStartedAt,
    sessionId: request.session.sessionId,
    initialQuery: request.session.initialQuery,
  };
}
