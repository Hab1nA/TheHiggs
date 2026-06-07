// ============================================================
// Frontend Client — API 调用
// ============================================================

import type { AUIRRequest, AUIRResponse } from "@/auir/types";
import type { PageLogContext, RuntimeLogAppendInput } from "./logging/types";

const API_URL = "/api/ai-ui";

/** 发送 AUIRRequest 到后端并返回 AUIRResponse */
export async function sendAUIRRequest(request: AUIRRequest): Promise<AUIRResponse> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AUIR API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function postRuntimeLog(
  context: PageLogContext | null,
  event: Omit<RuntimeLogAppendInput, "pageLogId" | "sessionId">,
): Promise<void> {
  if (!context?.pageLogId) return;

  try {
    await fetch("/api/runtime-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...event,
        pageLogId: context.pageLogId,
        sessionId: context.sessionId,
      }),
    });
  } catch (error) {
    console.warn("[RuntimeLog] frontend log failed:", error);
  }
}
