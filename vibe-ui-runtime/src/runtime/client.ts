import type { AUIRRequest, AUIRResponse } from "@/src/auir/types";

const API_URL = "/api/ai-ui";

/**
 * Send an AUIR event to the backend and receive the next UI state.
 */
export async function sendAUIREvent(
  request: AUIRRequest
): Promise<AUIRResponse> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    throw new Error(`AUIR request failed: ${res.status} - ${errorText}`);
  }

  return res.json();
}
