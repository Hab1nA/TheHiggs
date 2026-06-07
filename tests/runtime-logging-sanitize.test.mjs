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
