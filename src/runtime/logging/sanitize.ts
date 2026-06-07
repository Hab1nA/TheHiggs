import { createHash } from "node:crypto";

export type RuntimeLogSanitizeOptions = {
  maxStringLength?: number;
  maxDepth?: number;
};

const DEFAULT_MAX_STRING_LENGTH = Number(
  process.env.RUNTIME_LOG_MAX_STRING ?? 20_000,
);
const DEFAULT_MAX_DEPTH = 12;
const SENSITIVE_KEY_PATTERN =
  /(?:api[_-]?key|secret[_-]?key|(?:^|[^a-zA-Z])key(?:[^a-zA-Z]|$)|token|secret|authorization|password|cookie)/i;
const DATA_URL_PATTERN = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/;

export function sanitizeForRuntimeLog(
  value: unknown,
  options: RuntimeLogSanitizeOptions = {},
): unknown {
  const seen = new WeakSet<object>();
  const maxStringLength =
    options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  function sanitize(input: unknown, key: string | undefined, depth: number): unknown {
    if (key && SENSITIVE_KEY_PATTERN.test(key)) {
      return "[REDACTED]";
    }

    if (typeof input === "string") {
      return sanitizeString(input, maxStringLength);
    }

    if (
      input === null ||
      typeof input === "number" ||
      typeof input === "boolean"
    ) {
      return input;
    }

    if (typeof input === "bigint") {
      return input.toString();
    }

    if (typeof input === "undefined") {
      return "[undefined]";
    }

    if (typeof input === "function") {
      return `[Function ${input.name || "anonymous"}]`;
    }

    if (typeof input !== "object") {
      return String(input);
    }

    if (seen.has(input)) {
      return "[Circular]";
    }
    if (depth >= maxDepth) {
      return "[MaxDepth]";
    }

    seen.add(input);
    if (Array.isArray(input)) {
      return input.map((item) => sanitize(item, undefined, depth + 1));
    }

    const record: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(
      input as Record<string, unknown>,
    )) {
      record[entryKey] = sanitize(entryValue, entryKey, depth + 1);
    }
    return record;
  }

  return sanitize(value, undefined, 0);
}

function sanitizeString(value: string, maxStringLength: number): unknown {
  const dataUrl = summarizeDataUrl(value);
  if (dataUrl) return dataUrl;

  if (value.length > maxStringLength) {
    return {
      kind: "truncated-string",
      originalLength: value.length,
      sha256: sha256(value),
      value: value.slice(0, maxStringLength),
    };
  }

  return value;
}

function summarizeDataUrl(value: string):
  | {
      kind: "data-url";
      mime: string;
      byteLength: number;
      sha256: string;
      preview: string;
    }
  | null {
  const match = DATA_URL_PATTERN.exec(value);
  if (!match) return null;

  const mime = match[1] || "text/plain";
  const isBase64 = Boolean(match[2]);
  const data = match[3] ?? "";
  let bytes: Buffer;
  if (isBase64) {
    bytes = Buffer.from(data, "base64");
  } else {
    try {
      bytes = Buffer.from(decodeURIComponent(data), "utf8");
    } catch {
      // Malformed percent-encoding — use raw data
      bytes = Buffer.from(data, "utf8");
    }
  }

  return {
    kind: "data-url",
    mime,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    preview: value.slice(0, 96),
  };
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
