import { appendFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sanitizeForRuntimeLog } from "./sanitize";
import type {
    PageLogContext,
    RuntimeLogAppendInput,
    RuntimeLogEvent,
    RuntimeLogFileRecord,
} from "./types";

const LOG_DIR = join(process.cwd(), "runtime-logs");
const fileCache = new Map<string, string>();

export function isRuntimeLoggingEnabled(): boolean {
  return process.env.RUNTIME_LOG_ENABLED !== "false";
}

export async function ensurePageLog(
  context: PageLogContext,
): Promise<RuntimeLogFileRecord | null> {
  if (!isRuntimeLoggingEnabled() || !context.pageLogId) return null;

  try {
    const filePath = await getOrCreateLogFile(context);
    return { pageLogId: context.pageLogId, filePath };
  } catch (error) {
    warnLoggingFailure("ensurePageLog", error);
    return null;
  }
}

export async function appendRuntimeLog(
  event: RuntimeLogAppendInput,
): Promise<boolean> {
  if (!isRuntimeLoggingEnabled() || !event.pageLogId) return false;

  try {
    const filePath = await findLogFile(event.pageLogId);
    if (!filePath) {
      console.warn(`[runtime-log] No page log file found for pageLogId=${event.pageLogId}; event type=${event.type} dropped`);
      return false;
    }

    const normalized: RuntimeLogEvent = {
      ...event,
      id: createRuntimeLogEventId(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      payload: sanitizeForRuntimeLog(event.payload),
    };
    await appendFile(filePath, `${JSON.stringify(normalized)}\n`, "utf8");
    return true;
  } catch (error) {
    warnLoggingFailure("appendRuntimeLog", error);
    return false;
  }
}

export async function closePageLog(
  context: Pick<PageLogContext, "pageLogId" | "sessionId"> & {
    turn?: number;
    reason?: string;
  },
): Promise<void> {
  await appendRuntimeLog({
    type: "page.closed",
    pageLogId: context.pageLogId,
    sessionId: context.sessionId,
    turn: context.turn,
    stage: "frontend",
    status: "success",
    payload: { reason: context.reason ?? "closed" },
  });
}

function createRuntimeLogEventId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getOrCreateLogFile(context: PageLogContext): Promise<string> {
  const cached = fileCache.get(context.pageLogId);
  if (cached) return cached;

  await mkdir(LOG_DIR, { recursive: true });

  const existing = await findExistingLogFile(context.pageLogId);
  if (existing) {
    fileCache.set(context.pageLogId, existing);
    return existing;
  }

  const fileName = buildLogFileName(context);
  const filePath = join(LOG_DIR, fileName);
  fileCache.set(context.pageLogId, filePath);

  const startedEvent: RuntimeLogEvent = {
    id: createRuntimeLogEventId(),
    type: "page.started",
    timestamp: context.pageStartedAt,
    pageLogId: context.pageLogId,
    sessionId: context.sessionId,
    turn: 1,
    stage: "frontend",
    status: "started",
    payload: sanitizeForRuntimeLog({
      initialQuery: context.initialQuery,
      source: "launcher",
    }),
  };
  await writeFile(filePath, `${JSON.stringify(startedEvent)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return filePath;
}

async function findLogFile(pageLogId: string): Promise<string | null> {
  const cached = fileCache.get(pageLogId);
  if (cached) return cached;

  const existing = await findExistingLogFile(pageLogId);
  if (existing) {
    fileCache.set(pageLogId, existing);
    return existing;
  }
  return null;
}

async function findExistingLogFile(pageLogId: string): Promise<string | null> {
  try {
    const entries = await readdir(LOG_DIR);
    const match = entries.find((name) => name.includes(`_${pageLogId}_`));
    return match ? join(LOG_DIR, match) : null;
  } catch {
    return null;
  }
}

function buildLogFileName(context: PageLogContext): string {
  const timestamp = context.pageStartedAt
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
  return `${timestamp}_${safeSlug(context.pageLogId)}_${safeSlug(
    context.initialQuery ?? "page",
  )}.jsonl`;
}

function safeSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "page";
}

function warnLoggingFailure(operation: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[runtime-log] ${operation} failed:`, message.slice(0, 300));
}
