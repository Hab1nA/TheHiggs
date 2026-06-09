import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/components/SearchLauncher.tsx"),
  "utf-8",
);

test("SearchLauncher presents command-center startup information", () => {
  for (const text of [
    "运行时流水线",
    "能力矩阵",
    "启动入口",
    "输入意图",
    "提示细化",
    "界面生成",
    "质量复核",
    "上帝粒子",
    "万能 APP",
  ]) {
    assert.ok(source.includes(text), `missing startup copy: ${text}`);
  }
});

test("SearchLauncher keeps existing launch controls and example prompts", () => {
  for (const text of [
    "细化并启动",
    "思考并启动",
    "复核并启动",
    "生成一个火箭发动机循环参数分析工具",
    "生成一个包含收入指标、用户增长和留存分析的数据看板",
  ]) {
    assert.ok(source.includes(text), `missing launch control: ${text}`);
  }
});
