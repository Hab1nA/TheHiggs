import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const outDir = join(tmpdir(), "thehiggs-runtime-logging-test");

function loadSanitizer() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  execFileSync(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "src/runtime/logging/sanitize.ts",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--outDir",
      outDir,
      "--skipLibCheck",
      "--strict",
      "--esModuleInterop",
    ],
    { cwd: root, stdio: "pipe" },
  );
  return import(pathToFileURL(join(outDir, "sanitize.js")).href);
}

test("sanitizeForRuntimeLog redacts sensitive keys and summarizes data URLs", async () => {
  const { sanitizeForRuntimeLog } = await loadSanitizer();
  const imageData = Buffer.from("hello-image").toString("base64");

  const sanitized = sanitizeForRuntimeLog({
    apiKey: "sk-secret",
    nested: {
      Authorization: "Bearer token",
      image: `data:image/png;base64,${imageData}`,
    },
  });

  assert.equal(sanitized.apiKey, "[REDACTED]");
  assert.equal(sanitized.nested.Authorization, "[REDACTED]");
  assert.equal(sanitized.nested.image.kind, "data-url");
  assert.equal(sanitized.nested.image.mime, "image/png");
  assert.equal(sanitized.nested.image.byteLength, 11);
  assert.match(sanitized.nested.image.sha256, /^[a-f0-9]{64}$/);
});

test("sanitizeForRuntimeLog truncates long strings with original length", async () => {
  const { sanitizeForRuntimeLog } = await loadSanitizer();
  const sanitized = sanitizeForRuntimeLog(
    { prompt: "x".repeat(12) },
    { maxStringLength: 5 },
  );

  assert.equal(sanitized.prompt.kind, "truncated-string");
  assert.equal(sanitized.prompt.originalLength, 12);
  assert.equal(sanitized.prompt.value, "xxxxx");
});

test("sanitizeForRuntimeLog does NOT redact business keys containing 'key' as prefix", async () => {
  const { sanitizeForRuntimeLog } = await loadSanitizer();

  const sanitized = sanitizeForRuntimeLog({
    keyFeatures: ["feature1", "feature2"],
    keyPoints: "important points",
    apiKey: "sk-secret",
    secretKey: "my-secret",
  });

  // Business keys should NOT be redacted
  assert.deepEqual(sanitized.keyFeatures, ["feature1", "feature2"]);
  assert.equal(sanitized.keyPoints, "important points");

  // Credential keys SHOULD be redacted
  assert.equal(sanitized.apiKey, "[REDACTED]");
  assert.equal(sanitized.secretKey, "[REDACTED]");
});

test("sanitizeForRuntimeLog handles malformed data URL percent-encoding without throwing", async () => {
  const { sanitizeForRuntimeLog } = await loadSanitizer();

  // Malformed percent-encoding that would cause URIError in decodeURIComponent
  const sanitized = sanitizeForRuntimeLog({
    badData: "data:text/plain,%E0%A4%A",
  });

  // Should not throw — should return a data-url summary with raw bytes
  assert.equal(sanitized.badData.kind, "data-url");
  assert.equal(sanitized.badData.mime, "text/plain");
  assert.ok(sanitized.badData.byteLength > 0);
  assert.match(sanitized.badData.sha256, /^[a-f0-9]{64}$/);
});

test("sanitizeForRuntimeLog redacts standalone 'key' but not compound words starting with 'key'", async () => {
  const { sanitizeForRuntimeLog } = await loadSanitizer();

  const sanitized = sanitizeForRuntimeLog({
    key: "should-be-redacted",
    keyFeatures: "should-NOT-be-redacted",
    keyPoints: "should-NOT-be-redacted",
    api_key: "should-be-redacted",
    apiKey: "should-be-redacted",
  });

  assert.equal(sanitized.key, "[REDACTED]");
  assert.equal(sanitized.keyFeatures, "should-NOT-be-redacted");
  assert.equal(sanitized.keyPoints, "should-NOT-be-redacted");
  assert.equal(sanitized.api_key, "[REDACTED]");
  assert.equal(sanitized.apiKey, "[REDACTED]");
});
