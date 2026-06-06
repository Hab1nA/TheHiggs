import { NextRequest, NextResponse } from "next/server";
import { validateRequest, validateResponse, safeValidateResponse } from "@/src/auir/validate";
import { generateMockResponse } from "@/src/auir/mock";
import { FALLBACK_STATE } from "@/src/auir/schema";
import { SYSTEM_PROMPT, buildUserPrompt, buildRetryPrompt } from "@/src/auir/prompt";
import { applyMemoryPatch } from "@/src/auir/memory";
import type { AUIRRequest, AUIRResponse } from "@/src/auir/types";

// Check if we should use real LLM or mock
function shouldUseLLM(): boolean {
  const mode = process.env.NEXT_PUBLIC_RUNTIME_MODE;
  const apiKey = process.env.OPENAI_API_KEY;
  return mode === "llm" && !!apiKey;
}

async function callLLM(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1";
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 65536,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown");
    throw new Error(`LLM API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // Log full response structure for debugging
  if (data.choices?.[0]) {
    const finishReason = data.choices[0].finish_reason;
    console.log(`LLM finish_reason: ${finishReason}, model: ${data.model || "unknown"}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    console.error("LLM response structure:", JSON.stringify(data).slice(0, 500));
    throw new Error("LLM returned empty response");
  }

  // Extract JSON from possible markdown code fences
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  return jsonMatch ? jsonMatch[1].trim() : content.trim();
}

function buildFallbackResponse(request: AUIRRequest): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.1",
    next: {
      app: {
        id: "error_app",
        title: "Runtime Error",
        kind: "unknown",
      },
      memory: {
        app: {},
        session: {},
      },
      ui: FALLBACK_STATE.ui,
    },
    diagnostics: {
      warnings: ["Fallback UI generated due to LLM or validation failure."],
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate the incoming request
    const body = await request.json();
    let auirRequest: AUIRRequest;
    try {
      auirRequest = validateRequest(body);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        {
          error: "Invalid AUIR request",
          details: msg,
        },
        { status: 400 }
      );
    }

    // 2. Generate response (mock or LLM)
    let responseJson: unknown;
    const useLLM = shouldUseLLM();

    if (!useLLM) {
      // Use mock runtime
      responseJson = generateMockResponse(auirRequest);
    } else {
      // Use real LLM with retry logic
      const userPrompt = buildUserPrompt(JSON.stringify(auirRequest));

      let llmOutput: string;
      try {
        llmOutput = await callLLM(userPrompt, SYSTEM_PROMPT);
        console.log("LLM raw output (first 500 chars):", llmOutput.slice(0, 500));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("LLM call failed:", msg);
        // Return fallback on LLM error
        return NextResponse.json(buildFallbackResponse(auirRequest));
      }

      // 3. Validate LLM output, retry once if needed
      let parsedOutput: unknown;
      try {
        parsedOutput = JSON.parse(llmOutput);
      } catch {
        // Try extracting JSON from markdown fences
        const jsonMatch = llmOutput.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          try {
            parsedOutput = JSON.parse(jsonMatch[1].trim());
          } catch {
            console.error("Failed to parse LLM output as JSON even after extracting from fences");
            return NextResponse.json(buildFallbackResponse(auirRequest));
          }
        } else {
          console.error("Failed to parse LLM output as JSON:", llmOutput.slice(0, 300));
          return NextResponse.json(buildFallbackResponse(auirRequest));
        }
      }

      const firstValidation = safeValidateResponse(parsedOutput);
      if (firstValidation.success) {
        responseJson = firstValidation.response;
      } else {
        console.warn(
          "First LLM output failed validation, retrying...",
          firstValidation.errors
        );

        try {
          const retryPrompt = buildRetryPrompt(llmOutput, firstValidation.errors);
          const retryOutput = await callLLM(
            retryPrompt,
            "You are a JSON correction engine. Fix the AUIRResponse to match the schema."
          );
          console.log("LLM retry output (first 500 chars):", retryOutput.slice(0, 500));

          let retryParsed: unknown;
          try {
            retryParsed = JSON.parse(retryOutput);
          } catch {
            const jsonMatch = retryOutput.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
              retryParsed = JSON.parse(jsonMatch[1].trim());
            } else {
              console.error("Failed to parse retry output as JSON");
              return NextResponse.json(buildFallbackResponse(auirRequest));
            }
          }

          const retryValidation = safeValidateResponse(retryParsed);
          if (retryValidation.success) {
            responseJson = retryValidation.response;
          } else {
            console.error("Retry also failed:", retryValidation.errors);
            return NextResponse.json(buildFallbackResponse(auirRequest));
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("Retry LLM call failed:", msg);
          return NextResponse.json(buildFallbackResponse(auirRequest));
        }
      }
    }

    // 4. Final validation
    let auirResponse: AUIRResponse;
    try {
      auirResponse = validateResponse(responseJson);
    } catch {
      console.error("Final validation failed, returning fallback");
      return NextResponse.json(buildFallbackResponse(auirRequest));
    }

    // 5. Apply memory patch (server-side mutation of the memory for the next turn)
    // In MVP, memory is carried by the client, so we return it as-is
    // The client will apply the patch on its side

    return NextResponse.json(auirResponse);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Unhandled error in /api/ai-ui:", msg);
    return NextResponse.json(
      { error: "Internal server error", details: msg },
      { status: 500 }
    );
  }
}
