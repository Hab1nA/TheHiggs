// ============================================================
// POST /api/compress-memory — 记忆压缩端点
// ============================================================
// 当 memory 体积膨胀到可能干扰 AI 生成质量时，由前端异步调用。
// 调用轻量 AI 对 session/app 记忆进行摘要压缩，返回精简版本。
// 此调用不阻塞页面生成流程，在 AI 响应应用到前端后 fire-and-forget 执行。

import { getModel, isMockMode } from "@/ai/model";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

/** 前端序列化 memory 后超过此阈值（字符数）触发压缩 */
const COMPRESS_THRESHOLD = 8000;

const compressRequestSchema = z.object({
  memory: z.object({
    turn: z.record(z.string(), z.unknown()),
    session: z.record(z.string(), z.unknown()),
    app: z.record(z.string(), z.unknown()),
    user: z.array(z.unknown()),
  }),
  /** 当前 memory 的 JSON 字符串长度，供日志记录 */
  currentSize: z.number(),
});

const compressedMemorySchema = z
  .object({
    session: z.record(z.string(), z.unknown()),
    app: z.record(z.string(), z.unknown()),
  })
  .refine(
    (data) =>
      Object.keys(data.session).length > 0 || Object.keys(data.app).length > 0,
    {
      message:
        "Compressed memory must not be empty — at least session or app must have entries",
    },
  );

const COMPRESS_SYSTEM_PROMPT = `You are a memory compression engine for an AI-UI runtime.

You receive the CURRENT memory state of an active application session. Your job is to produce a COMPRESSED version that preserves essential context while reducing size.

CORE PRINCIPLE: app.memory stores data the AI previously generated. That data is ALREADY rendered in the UI tree. Memory only needs to retain what the AI needs to UNDERSTAND the current state — not re-send the full dataset.

COMPRESSION RULES:
1. PRESERVE (never compress):
   - Session metadata: currentTask, currentView, postProcess, searchQuery, selectedId, active filters
   - User preferences and feature flags
   - Key scalar values (query, mode, status)
2. SUMMARIZE large data arrays:
   - Keep the FIRST 5 items as samples (for the AI to understand the data shape)
   - Add a "<key>_summary" field: a brief natural-language description of the full dataset (e.g., "20 条航班记录，包含出发/到达航班，字段: 航班号/航司/目的地/时间/状态/登机口/航站楼")
   - Add a "<key>_count" field with the total number of items
3. DROP:
   - Timestamps (createdAt, lastUpdate, updatedAt)
   - Event IDs (eventId, requestId)
   - Values that are derived from or duplicated in other fields
4. Return ONLY a JSON object with "session" and "app" keys.

EXAMPLE:
Input app: { "flights_departure": [10 items with 8 fields each], "flights_arrival": [10 items], "query": "北京" }
Output app: {
  "flights_departure": [first 5 items],
  "flights_departure_summary": "10 条出发航班，字段: 航班号/航司/目的地/计划时间/实际时间/状态/登机口/航站楼",
  "flights_departure_count": 10,
  "flights_arrival": [first 5 items],
  "flights_arrival_summary": "10 条到达航班，字段同上",
  "flights_arrival_count": 10,
  "query": "北京"
}`;

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = compressRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { memory, currentSize } = parsed.data;

  // Mock mode: strip large arrays to first 3 items, keep everything else
  if (isMockMode()) {
    const compressed = mockCompress({
      session: memory.session,
      app: memory.app,
    });
    const newSize = JSON.stringify(compressed).length;
    console.log(
      `[compress-memory] Mock mode: ${currentSize} → ${newSize} chars (${Math.round((1 - newSize / currentSize) * 100)}% reduction)`,
    );
    return NextResponse.json({ ok: true, compressed, mock: true });
  }

  try {
    const model = getModel("enabled"); // thinking enabled for better compression quality
    const memJson = JSON.stringify(
      { session: memory.session, app: memory.app },
      null,
      0,
    );

    const startedAt = Date.now();
    const result = await generateObject({
      model,
      schema: compressedMemorySchema,
      system: COMPRESS_SYSTEM_PROMPT,
      prompt: `Compress this memory (current size: ${currentSize} chars):\n${memJson}`,
      mode: "json",
      temperature: 0.1,
      maxTokens: 2000,
    });

    const compressed = result.object as {
      session: Record<string, unknown>;
      app: Record<string, unknown>;
    };
    const newSize = JSON.stringify(compressed).length;
    const durationMs = Date.now() - startedAt;

    console.log(
      `[compress-memory] ${currentSize} → ${newSize} chars (${Math.round((1 - newSize / currentSize) * 100)}% reduction, ${durationMs}ms)`,
    );

    return NextResponse.json({ ok: true, compressed, durationMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[compress-memory] Failed:", message);
    // Non-critical: return ok=false, frontend keeps original memory
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Mock 模式压缩：大数组保留前 5 条样本 + 摘要描述 + 计数 */
function mockCompress(memory: {
  session: Record<string, unknown>;
  app: Record<string, unknown>;
}): { session: Record<string, unknown>; app: Record<string, unknown> } {
  const SAMPLE_SIZE = 5;

  const compressRecord = (
    obj: Record<string, unknown>,
  ): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value) && value.length > SAMPLE_SIZE) {
        // Keep first N items as samples
        result[key] = value.slice(0, SAMPLE_SIZE);
        // Generate a descriptive summary based on the data shape
        const firstItem = value[0];
        const fieldNames =
          firstItem &&
          typeof firstItem === "object" &&
          !Array.isArray(firstItem)
            ? Object.keys(firstItem as Record<string, unknown>).join("/")
            : Array.isArray(firstItem)
              ? `${(firstItem as unknown[]).length} 个字段/行`
              : typeof firstItem;
        result[`${key}_summary`] =
          `${value.length} 条数据，字段: ${fieldNames}`;
        result[`${key}_count`] = value.length;
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  return {
    session: compressRecord(memory.session),
    app: compressRecord(memory.app),
  };
}
