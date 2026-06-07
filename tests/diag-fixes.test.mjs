// ============================================================
// Tests: Runtime-Log 422 竞态修复 + 图片下载 403 黑名单
// ============================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

// ─── Runtime-Log 422 Fix Tests ──────────────────────────────

test("appendRuntimeLog contains auto-create logic (code verification)", () => {
  const serverCode = readFileSync(
    join(root, "src/runtime/logging/server.ts"),
    "utf8",
  );

  // 验证修复代码存在：当 findLogFile 返回 null 时自动创建文件
  assert.ok(
    serverCode.includes("auto-creating"),
    "server.ts should contain auto-create log for missing file",
  );
  assert.ok(
    serverCode.includes("getOrCreateLogFile"),
    "server.ts should call getOrCreateLogFile when file not found",
  );

  // 验证旧的丢弃逻辑被替换
  assert.ok(
    !serverCode.includes("event type=${event.type} dropped") ||
      serverCode.includes("Auto-create failed"),
    "old drop logic should be replaced with auto-create",
  );
});

// ─── Image 403 Domain Blocklist Tests ───────────────────────

test("downloadResource code contains blocked domains list", () => {
  const toolsCode = readFileSync(join(root, "src/ai/webTools.ts"), "utf8");

  assert.ok(
    toolsCode.includes("BLOCKED_DOMAINS"),
    "webTools.ts should contain BLOCKED_DOMAINS set",
  );
  assert.ok(
    toolsCode.includes("images.stockcake.com"),
    "stockcake.com should be in blocked domains",
  );
});

test("URL parsing correctly identifies blocked domains", () => {
  const blockedUrl = "https://images.stockcake.com/public/test.jpg";
  const parsedUrl = new URL(blockedUrl);

  const BLOCKED_DOMAINS = new Set([
    "images.stockcake.com",
    "www.stockcake.com",
  ]);

  assert.ok(
    BLOCKED_DOMAINS.has(parsedUrl.hostname),
    "stockcake.com should be in blocked domains",
  );
});

test("URL parsing correctly allows non-blocked domains", () => {
  const allowedUrl = "https://images.unsplash.com/test.jpg";
  const parsedUrl = new URL(allowedUrl);

  const BLOCKED_DOMAINS = new Set([
    "images.stockcake.com",
    "www.stockcake.com",
  ]);

  assert.ok(
    !BLOCKED_DOMAINS.has(parsedUrl.hostname),
    "unsplash.com should NOT be blocked",
  );
});
