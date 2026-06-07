// ============================================================
// POST /api/ai-ui — 核心 AI Runtime Endpoint
// ============================================================
// 接收 AUIRRequest，调用 AI Runtime，返回 AUIRResponse。

import { runAIRuntime } from "@/ai/runtime";
import { createFallbackResponse } from "@/auir/fallback";
import type { AUIRResponse } from "@/auir/types";
import { validateRequest } from "@/auir/validate";
import { NextResponse } from "next/server";

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

  try {
    const response = await runAIRuntime(request);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[API /api/ai-ui] Runtime error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown runtime error";
    return NextResponse.json(
      createFallbackResponse(`AI runtime failed: ${message}`),
      { status: 500 },
    );
  }
}
