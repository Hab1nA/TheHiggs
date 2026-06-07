import { appendRuntimeLog } from "@/runtime/logging/server";
import type { RuntimeLogAppendInput } from "@/runtime/logging/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const event = json as RuntimeLogAppendInput;
  if (!event || typeof event !== "object" || typeof event.pageLogId !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing pageLogId" },
      { status: 400 },
    );
  }

  await appendRuntimeLog(event);
  return NextResponse.json({ ok: true });
}
