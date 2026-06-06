import type { AUIRRequest, AUIRResponse } from "./types";
import { auirRequestSchema, auirResponseSchema } from "./schema";

/**
 * Validate an AUIRRequest against the Zod schema.
 * Returns the parsed request or throws with validation errors.
 */
export function validateRequest(data: unknown): AUIRRequest {
  return auirRequestSchema.parse(data);
}

/**
 * Validate an AUIRResponse against the Zod schema.
 * Returns the parsed response or throws with validation errors.
 */
export function validateResponse(data: unknown): AUIRResponse {
  return auirResponseSchema.parse(data);
}

/**
 * Safely validate a response, returning validation errors as a string.
 */
export function safeValidateResponse(
  data: unknown
): { success: true; response: AUIRResponse } | { success: false; errors: string } {
  const result = auirResponseSchema.safeParse(data);
  if (result.success) {
    return { success: true, response: result.data };
  }
  return {
    success: false,
    errors: result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n"),
  };
}
