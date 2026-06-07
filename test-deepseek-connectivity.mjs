#!/usr/bin/env node
// ============================================================
// DeepSeek API 最小连通性测试
// 使用项目现有的 @ai-sdk/openai + ai 包
// ============================================================

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// 手动加载 .env.local（如果存在且尚未设置）
const envLocalPath = resolve(process.cwd(), ".env.local");
if (existsSync(envLocalPath)) {
  const lines = readFileSync(envLocalPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
  console.log(`✅ 已加载 .env.local`);
} else {
  console.log(`⚠️  未找到 .env.local，使用系统环境变量`);
}

// 读取配置
const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com";
const model = process.env.AI_MODEL ?? "deepseek-v4-flash";

console.log("\n📋 配置信息:");
console.log(`   API Key: ${apiKey ? `${apiKey.slice(0, 8)}...` : "❌ 未设置"}`);
console.log(`   Base URL: ${baseURL}`);
console.log(`   Model: ${model}`);

if (!apiKey) {
  console.error("\n❌ 错误: OPENAI_API_KEY 未设置");
  console.log("请创建 .env.local 文件并设置 OPENAI_API_KEY=sk-your-key-here");
  process.exit(1);
}

// 创建 provider
const provider = createOpenAI({
  apiKey,
  baseURL,
});

console.log("\n🔄 正在测试 API 连通性...");
console.log("   发送请求到:", `${baseURL}/chat/completions`);
console.log("   使用模型:", model);

const startTime = Date.now();

try {
  const { text, usage } = await generateText({
    model: provider(model),
    prompt: "Say 'Hello, I am DeepSeek API' in one sentence.",
    maxTokens: 50,
  });

  const elapsed = Date.now() - startTime;

  console.log("\n✅ API 连通性测试成功!");
  console.log(`   响应时间: ${elapsed}ms`);
  console.log(`   响应内容: ${text.trim()}`);
  console.log(`   Token 用量: ${usage.promptTokens} (prompt) + ${usage.completionTokens} (completion) = ${usage.totalTokens} (total)`);

  process.exit(0);
} catch (error) {
  const elapsed = Date.now() - startTime;

  console.error("\n❌ API 连通性测试失败!");
  console.error(`   耗时: ${elapsed}ms`);
  console.error(`   错误类型: ${error.constructor.name}`);
  console.error(`   错误信息: ${error.message}`);

  // 提供常见错误的诊断建议
  if (error.message.includes("ECONNREFUSED") || error.message.includes("ENOTFOUND")) {
    console.log("\n💡 诊断: 无法连接到 API 服务器");
    console.log("   - 检查网络连接");
    console.log("   - 检查 OPENAI_BASE_URL 是否正确");
    console.log("   - 如果使用代理，请确保代理配置正确");
  } else if (error.message.includes("401") || error.message.includes("Unauthorized")) {
    console.log("\n💡 诊断: API Key 无效或已过期");
    console.log("   - 检查 OPENAI_API_KEY 是否正确");
    console.log("   - 确认 API Key 是否有余额");
  } else if (error.message.includes("429") || error.message.includes("Too Many Requests")) {
    console.log("\n💡 诊断: 请求频率过高");
    console.log("   - 等待一段时间后重试");
    console.log("   - 检查 API 配额是否用尽");
  } else if (error.message.includes("500") || error.message.includes("502") || error.message.includes("503")) {
    console.log("\n💡 诊断: API 服务器错误");
    console.log("   - DeepSeek 服务可能暂时不可用");
    console.log("   - 稍后重试或查看 DeepSeek 状态页面");
  } else if (error.message.includes("timeout") || error.message.includes("ETIMEDOUT")) {
    console.log("\n💡 诊断: 请求超时");
    console.log("   - 网络连接可能不稳定");
    console.log("   - 尝试增加超时时间或检查网络");
  }

  process.exit(1);
}