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
    const resp = createFallbackResponse("Invalid JSON body");
    // Best-effort: try to extract pageLogId from raw body for logging
    await logValidationFailure(req, "Invalid JSON body");
    return NextResponse.json(resp, { status: 400 });
  }

  // Validate request
  const validation = validateRequest(json);
  if (!validation.ok) {
    const errorMsg = `Invalid AUIRRequest: ${validation.errors.join("; ")}`;
    await logValidationFailure(json, errorMsg);
    return NextResponse.json(createFallbackResponse(errorMsg), {
      status: 400,
    });
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
    const isFallback = response.diagnostics?.simulatedData === true;
    await appendRuntimeLog({
      type: "api.ai_ui.response.sent",
      pageLogId: pageLogContext?.pageLogId,
      sessionId: request.session.sessionId,
      turn: request.session.turn,
      stage: "api",
      status: isFallback ? "failure" : "success",
      durationMs: Date.now() - startedAt,
      payload: { response, isFallback },
    });
    // Use 206 Partial Content for fallback responses so clients can distinguish
    // real AI output from degraded mock responses.
    return NextResponse.json(response, { status: isFallback ? 206 : 200 });
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

/** Best-effort logging for validation failures — extract pageLogId from raw data if possible */
async function logValidationFailure(raw: unknown, error: string): Promise<void> {
  try {
    const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const session = obj.session as Record<string, unknown> | undefined;
    const pageLogId = session?.pageLogId as string | undefined;
    const sessionId = session?.sessionId as string | undefined;
    if (pageLogId) {
      await appendRuntimeLog({
        type: "api.ai_ui.validation.failed",
        pageLogId,
        sessionId,
        stage: "api",
        status: "failure",
        payload: { error },
      });
    }
  } catch {
    // Silently ignore — this is best-effort
  }
}
