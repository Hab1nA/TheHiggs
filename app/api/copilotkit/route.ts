// ============================================================
// CopilotKit Runtime Endpoint（可选占位）
// ============================================================
// 第一版不启用 CopilotKit runtime。保留此文件为后续接入预留位置。
// 启用时请参考: https://docs.copilotkit.ai/quickstart

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "CopilotKit runtime is not yet enabled in this version." },
    { status: 501 }
  );
}
