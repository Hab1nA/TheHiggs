/**
 * 审查报告系统性复现验证测试
 *
 * 按照「runtime 日志、API 路由、错误捕获和日志落盘链路.md」
 * 中每个问题的「日志验证」方法逐一复现并确认修复。
 */

import assert from "node:assert/strict";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const outDir = join(tmpdir(), "thehiggs-audit-verify");

function compileSanitizer() {
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

function readSrc(relPath) {
  return readFileSync(join(root, relPath), "utf-8");
}

// ─── 问题 1: 日志 API 表面成功，但实际写入失败不可见 ────────────────────────
// 文档验证：对一次交互记录提交前后的 runtime-logs/*.jsonl 行数，同时看浏览器
// Network 的 /api/runtime-log 响应。若响应 { ok: true } 但文件未新增对应事件，
// 即命中该风险。

test("问题1: postRuntimeLog 检查 res.ok — 前端代码", () => {
  const src = readSrc("src/runtime/client.ts");

  // postRuntimeLog 应检查 HTTP 响应状态
  assert.ok(
    src.includes("if (!res.ok)"),
    "postRuntimeLog 必须检查 res.ok，不能只靠 fetch 异常捕获",
  );
  // 应该有明确的 warn 日志
  assert.ok(
    src.includes("server rejected log event"),
    "postRuntimeLog 应在服务端拒绝时输出警告",
  );
});

test("问题1: /api/runtime-log 路由返回真实写入状态", () => {
  const src = readSrc("app/api/runtime-log/route.ts");

  // 路由不应总是返回 { ok: true }
  assert.ok(
    src.includes("const appended = await appendRuntimeLog(event)"),
    "路由必须接收 appendRuntimeLog 的返回值",
  );
  assert.ok(src.includes("!appended"), "路由必须检查写入是否成功");
  // 写入失败时应返回非 200 状态码
  assert.ok(src.includes("422"), "写入失败应返回 422 而非总是 200");
  // 不应有「总是返回 ok: true」的模式
  const alwaysOkPattern =
    /await appendRuntimeLog\(event\);\s*return NextResponse\.json\(\{ ok: true \}\)/;
  assert.ok(
    !alwaysOkPattern.test(src),
    "不应存在「调用 appendRuntimeLog 后无条件返回 ok: true」的代码",
  );
});

test("问题1: appendRuntimeLog 返回 boolean 指示成功/失败", () => {
  const src = readSrc("src/runtime/logging/server.ts");

  // 返回类型应为 boolean
  assert.ok(
    src.includes("Promise<boolean>"),
    "appendRuntimeLog 返回类型应为 Promise<boolean>",
  );
  // 成功时返回 true
  assert.ok(src.includes("return true"), "成功写入时应返回 true");
  // 失败时返回 false
  const falseReturns = src.match(/return false/g);
  assert.ok(
    falseReturns && falseReturns.length >= 2,
    "应在 disabled / not-found / error 时返回 false",
  );
});

// ─── 问题 2: 没有已创建 page log 时，后端日志会静默丢失 ────────────────────
// 文档验证：故意让 /api/ai-ui 收到无效 JSON 或缺失 session/pageLogId 的请求，
// 预期只看到 HTTP 400 fallback，runtime-logs 中不会出现 api.ai_ui.request.received
// 或 validation failure 事件。

test("问题2: /api/ai-ui 无效 JSON 请求时尝试记录 validation failure", () => {
  const src = readSrc("app/api/ai-ui/route.ts");

  // Invalid JSON 分支应调用 logValidationFailure
  assert.ok(
    src.includes('await logValidationFailure(req, "Invalid JSON body")'),
    "Invalid JSON 时应尝试记录日志",
  );
});

test("问题2: /api/ai-ui schema 校验失败时记录 validation failure", () => {
  const src = readSrc("app/api/ai-ui/route.ts");

  // Validation 失败分支应调用 logValidationFailure
  assert.ok(
    src.includes("await logValidationFailure(json, errorMsg)"),
    "Schema 校验失败时应尝试记录日志",
  );
  // 应有 logValidationFailure 辅助函数
  assert.ok(
    src.includes("function logValidationFailure("),
    "应定义 logValidationFailure 辅助函数",
  );
  // 记录的事件类型应明确标识 validation failure
  assert.ok(
    src.includes("api.ai_ui.validation.failed"),
    "应记录 api.ai_ui.validation.failed 事件类型",
  );
});

test("问题2: appendRuntimeLog 缺失 page log 时输出明确警告", () => {
  const src = readSrc("src/runtime/logging/server.ts");

  // findLogFile 返回 null 时应有 console.warn
  assert.ok(
    src.includes("No page log file found for pageLogId="),
    "缺失 page log 文件时应输出明确警告",
  );
});

// ─── 问题 3: 脱敏规则过宽，AI 生成复盘字段会被误删 ─────────────────────────
// 文档验证：搜索 runtime-logs/*.jsonl 中的 keyFeatures 和 [REDACTED]。
// 如果 refine / generation payload 的需求特征被脱敏，后续排查会缺少关键上下文。

test("问题3: 脱敏正则不匹配 keyFeatures / keyPoints 等业务字段", async () => {
  const { sanitizeForRuntimeLog } = await compileSanitizer();

  const result = sanitizeForRuntimeLog({
    keyFeatures: ["operator encyclopedia", "map guide"],
    keyPoints: "important analysis points",
    apiKey: "sk-should-be-redacted",
    secretKey: "secret-should-be-redacted",
    api_key: "also-redacted",
  });

  // 业务字段不应被脱敏
  assert.deepEqual(
    result.keyFeatures,
    ["operator encyclopedia", "map guide"],
    "keyFeatures 不应被脱敏 — 它是 refine 输出的业务字段",
  );
  assert.equal(
    result.keyPoints,
    "important analysis points",
    "keyPoints 不应被脱敏",
  );

  // 敏感凭证应被脱敏
  assert.equal(result.apiKey, "[REDACTED]", "apiKey 应被脱敏");
  assert.equal(result.secretKey, "[REDACTED]", "secretKey 应被脱敏");
  assert.equal(result.api_key, "[REDACTED]", "api_key 应被脱敏");
});

test("问题3: 脱敏正则匹配精确的敏感 key 模式", async () => {
  const { sanitizeForRuntimeLog } = await compileSanitizer();

  const result = sanitizeForRuntimeLog({
    key: "standalone-key",
    token: "bearer-token",
    secret: "my-secret",
    authorization: "Bearer xxx",
    password: "p@ss",
    cookie: "session=abc",
  });

  assert.equal(result.key, "[REDACTED]", "standalone 'key' 应被脱敏");
  assert.equal(result.token, "[REDACTED]", "'token' 应被脱敏");
  assert.equal(result.secret, "[REDACTED]", "'secret' 应被脱敏");
  assert.equal(result.authorization, "[REDACTED]", "'authorization' 应被脱敏");
  assert.equal(result.password, "[REDACTED]", "'password' 应被脱敏");
  assert.equal(result.cookie, "[REDACTED]", "'cookie' 应被脱敏");
});

// ─── 问题 4: 脱敏处理本身可能让整条日志写入失败 ─────────────────────────────
// 文档验证：构造 payload 含 data:text/plain,%E0%A4%A 的 runtime-log 事件。
// 预期文件无新增事件，dev server 控制台出现 appendRuntimeLog failed。

test("问题4: malformed percent-encoding data URL 不抛 URIError", async () => {
  const { sanitizeForRuntimeLog } = await compileSanitizer();

  // %E0%A4%A 是不完整的 UTF-8 序列，decodeURIComponent 会抛 URIError
  assert.doesNotThrow(() => {
    const result = sanitizeForRuntimeLog({
      badImage: "data:text/plain,%E0%A4%A",
    });
    // 应返回 data-url 摘要而不是抛异常
    assert.equal(result.badImage.kind, "data-url");
    assert.equal(result.badImage.mime, "text/plain");
    assert.ok(result.badImage.byteLength > 0, "应有字节长度");
    assert.match(result.badImage.sha256, /^[a-f0-9]{64}$/, "应有 sha256");
  }, "malformed data URL 不应导致整个 sanitize 抛异常");
});

test("问题4: 合法 data URL 仍然正常处理", async () => {
  const { sanitizeForRuntimeLog } = await compileSanitizer();

  const base64Data = Buffer.from("hello world").toString("base64");
  const result = sanitizeForRuntimeLog({
    image: `data:image/png;base64,${base64Data}`,
    textUrl: "data:text/plain,hello%20world",
  });

  assert.equal(result.image.kind, "data-url");
  assert.equal(result.image.mime, "image/png");
  assert.equal(result.image.byteLength, 11);

  assert.equal(result.textUrl.kind, "data-url");
  assert.equal(result.textUrl.mime, "text/plain");
  assert.equal(result.textUrl.byteLength, 11);
});

// ─── 问题 5: 页面本地交互日志粒度不足 ───────────────────────────────────────
// 文档验证：操作输入框、select、checkbox 后检查 jsonl，只会看到
// frontend.local_state.changed；无法直接从日志确认"哪个组件、哪个交互意图"。

test("问题5: ComponentInteractionMeta 类型已定义并导出", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  assert.ok(
    src.includes("export type ComponentInteractionMeta"),
    "ComponentInteractionMeta 应被导出",
  );
  assert.ok(src.includes("componentId: string"), "应包含 componentId 字段");
  assert.ok(src.includes("componentType: string"), "应包含 componentType 字段");
  assert.ok(src.includes("label?: string"), "应包含可选 label 字段");
  assert.ok(
    src.includes("interactionMode?: string"),
    "应包含可选 interactionMode 字段",
  );
});

test("问题5: 所有输入组件的 setLocalValue 调用都传递元数据", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  const inputComponents = [
    { name: "TextInputRender", type: "text_input" },
    { name: "NumberInputRender", type: "number_input" },
    { name: "TextareaRender", type: "textarea" },
    { name: "SelectRender", type: "select" },
    { name: "CheckboxRender", type: "checkbox" },
    { name: "SliderRender", type: "slider" },
    { name: "StepperRender", type: "stepper" },
  ];

  for (const { name, type } of inputComponents) {
    const fnStart = src.indexOf(`function ${name}(`);
    assert.ok(fnStart >= 0, `${name} 应存在`);

    // 找到函数体（到下一个 function 声明）
    const nextFn = src.indexOf("\nfunction ", fnStart + 1);
    const fnCode = src.slice(fnStart, nextFn > 0 ? nextFn : src.length);

    assert.ok(
      fnCode.includes(`componentType: "${type}"`),
      `${name} 应传递 componentType: "${type}"`,
    );
    assert.ok(fnCode.includes("componentId:"), `${name} 应传递 componentId`);
  }
});

test("问题5: handleSetLocalValue 接收并记录元数据到日志", () => {
  const src = readSrc("app/page.tsx");

  // 函数签名应接受 meta 参数 (允许跨行格式)
  assert.ok(
    /meta\?:\s*\{\s*componentId\?:\s*string;\s*componentType\?:\s*string;\s*label\?:\s*string;\s*interactionMode\?:\s*string/.test(
      src,
    ),
    "handleSetLocalValue 应接受 meta 参数",
  );
  // payload 应包含 component 元数据
  assert.ok(
    src.includes("...(meta ? { component: meta } : {})"),
    "日志 payload 应包含 component 元数据",
  );
});

// ─── 问题 6: AI 生成失败会被降级成成功响应 ──────────────────────────────────
// 文档验证：不要只看 HTTP 200 或 frontend.ai_response.applied。要在同一
// pageLogId 下搜索 runtime.fallback_to_mock、ui_generation.fallback。

test("问题6: /api/ai-ui 对 fallback 响应返回 206 而非 200", () => {
  const src = readSrc("app/api/ai-ui/route.ts");

  // 应检测 simulatedData
  assert.ok(
    src.includes("response.diagnostics?.simulatedData === true"),
    "应检查 simulatedData 标识",
  );
  // fallback 应返回 206
  assert.ok(
    src.includes("isDegraded ? 206 : 200"),
    "fallback 响应应返回 206 Partial Content",
  );
  // 日志应标记为 failure
  assert.ok(
    src.includes('status: isDegraded ? "failure" : "success"'),
    "fallback 响应的日志 status 应为 failure",
  );
});

test("问题6: page.tsx 客户端检测 fallback 并警告", () => {
  const src = readSrc("app/page.tsx");

  assert.ok(
    src.includes("response.diagnostics?.simulatedData"),
    "客户端应检测 simulatedData",
  );
  assert.ok(src.includes("示例数据"), "客户端应对 fallback 发出警告");
});

// ─── 问题 7: Refine 前端失败路径只写 console，不写 runtime log ──────────────
// 文档验证：断网或让 /api/refine 返回失败后，runtime-logs 里通常只能看到后续
// 普通 search 链路；缺少"refine 在前端失败并降级"的明确事件。

test("问题7: SearchLauncher 导入了 postRuntimeLog", () => {
  const src = readSrc("src/components/SearchLauncher.tsx");

  assert.ok(
    src.includes('import { postRuntimeLog } from "@/runtime/client"'),
    "SearchLauncher 应导入 postRuntimeLog",
  );
});

test("问题7: refine HTTP 错误时写入 runtime log", () => {
  const src = readSrc("src/components/SearchLauncher.tsx");

  // !res.ok 分支
  const httpErrorIdx = src.indexOf("!res.ok");
  assert.ok(httpErrorIdx >= 0, "应有 !res.ok 检查");

  // 附近应有 postRuntimeLog 调用
  const nearbyCode = src.slice(httpErrorIdx, httpErrorIdx + 400);
  assert.ok(
    nearbyCode.includes("postRuntimeLog(pageLogContext"),
    "HTTP 错误时应调用 postRuntimeLog",
  );
  assert.ok(
    nearbyCode.includes("refine.frontend.http_error"),
    "应记录 refine.frontend.http_error 事件类型",
  );
});

test("问题7: refine 业务失败时写入 runtime log", () => {
  const src = readSrc("src/components/SearchLauncher.tsx");

  assert.ok(
    src.includes("refine.frontend.business_failure"),
    "应记录 refine.frontend.business_failure 事件类型",
  );
});

test("问题7: refine fetch 异常时写入 runtime log", () => {
  const src = readSrc("src/components/SearchLauncher.tsx");

  assert.ok(
    src.includes("refine.frontend.fetch_error"),
    "应记录 refine.frontend.fetch_error 事件类型",
  );
});

// ─── 额外: 确保改动不影响业务逻辑 ──────────────────────────────────────────

test("回归: appendRuntimeLog 的所有调用点不受返回值类型变更影响", () => {
  // appendRuntimeLog 从 void 改为 boolean，但调用点通常用 await/void 前缀
  // 不会因为返回值变化而出错。验证调用点不会尝试将返回值用作条件判断之外的用途。
  const files = [
    "app/api/ai-ui/route.ts",
    "app/api/runtime-log/route.ts",
    "src/ai/runtime.ts",
    "src/ai/generateNextState.ts",
  ];

  for (const file of files) {
    const src = readSrc(file);
    // 不应有 const result = await appendRuntimeLog(...) 模式（除非是 route.ts）
    const constAssignPattern = /const \w+ = await appendRuntimeLog\(/g;
    const matches = [...src.matchAll(constAssignPattern)];
    if (file === "app/api/runtime-log/route.ts") {
      // route.ts 是唯一使用返回值的地方
      assert.ok(matches.length === 1, `${file} 应使用返回值`);
    } else {
      assert.ok(matches.length === 0, `${file} 不应将返回值赋给变量`);
    }
  }
});

test("回归: setLocalValue 扩展是向后兼容的", () => {
  const src = readSrc("src/runtime/Renderer.tsx");

  // meta 参数是可选的
  assert.ok(
    src.includes("meta?: ComponentInteractionMeta"),
    "meta 参数应为可选",
  );
  // RendererProps 中 setLocalValue 的 meta 也应可选 (允许跨行格式)
  assert.ok(
    /value:\s*unknown,\s*meta\?:\s*ComponentInteractionMeta/.test(src),
    "RendererProps.setLocalValue 的 meta 应可选",
  );
});

test("回归: 所有现有事件类型未被删除或重命名", () => {
  const aiUiSrc = readSrc("app/api/ai-ui/route.ts");
  const runtimeSrc = readSrc("src/ai/runtime.ts");

  // 原有的事件类型必须仍然存在
  const requiredEventTypes = [
    "api.ai_ui.request.received",
    "api.ai_ui.response.sent",
    "api.ai_ui.runtime.error",
    "runtime.mode.selected",
    "runtime.fallback_to_mock",
  ];

  for (const eventType of requiredEventTypes) {
    const inAiUi = aiUiSrc.includes(`"${eventType}"`);
    const inRuntime = runtimeSrc.includes(`"${eventType}"`);
    assert.ok(inAiUi || inRuntime, `事件类型 ${eventType} 应仍然存在`);
  }
});
