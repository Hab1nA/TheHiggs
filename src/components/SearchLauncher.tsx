// ============================================================
// SearchLauncher — App Launcher 搜索框
// ============================================================

"use client";

import type { AUIREvent } from "@/auir/types";
import { postRuntimeLog } from "@/runtime/client";
import { createAppSearchEvent } from "@/runtime/event";
import type { PageLogContext } from "@/runtime/logging/types";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

const EXAMPLES = [
  {
    label: "数据驾驶舱",
    query: "生成一个包含收入指标、用户增长和留存分析的数据看板",
    meta: "分析场景",
  },
  {
    label: "项目追踪器",
    query: "生成一个包含里程碑、时间线和风险状态的项目管理界面",
    meta: "运营协作",
  },
  {
    label: "健康实验室",
    query: "生成一个健康与运动追踪应用，展示训练、睡眠和身体指标",
    meta: "个人数据",
  },
  {
    label: "组件图谱",
    query: "生成一个展示 TheHiggs 组件能力的交互式样例页面",
    meta: "运行时质检",
  },
  {
    label: "转化漏斗",
    query: "生成一个包含转化漏斗、热力图和关键路径分析的增长看板",
    meta: "增长分析",
  },
  {
    label: "火箭发动机",
    query: "生成一个火箭发动机循环参数分析工具",
    meta: "工程计算",
  },
];

const PIPELINE_STAGES = [
  { label: "输入意图", detail: "理解目标、约束和应用边界" },
  { label: "提示细化", detail: "把简短需求扩展为结构化应用简报" },
  { label: "界面生成", detail: "生成可验证的语义 UI 组件树" },
  { label: "质量复核", detail: "审查布局、功能和多轮稳定性" },
];

export default function SearchLauncher({
  onSearch,
  disabled,
}: {
  onSearch: (event: AUIREvent, pageLogContext?: PageLogContext) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [refineMode, setRefineMode] = useState(false);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [postProcessMode, setPostProcessMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [refining, setRefining] = useState(false);

  // Guard ref: prevents persist effects from overwriting localStorage with
  // default `false` values before the restore effect has finished. The flag
  // is deferred via setTimeout(0) so it becomes `true` only after all effects
  // in the current render batch have executed (critical for React 19 StrictMode
  // where effects are double-invoked: setup → cleanup → setup).
  const restoredRef = useRef(false);

  // 从 localStorage 恢复 AI 模式开关状态（仅客户端，避免 SSR Hydration 不一致）
  useEffect(() => {
    setRefineMode(localStorage.getItem("thehiggs_refineMode") === "true");
    setThinkingMode(localStorage.getItem("thehiggs_thinkingMode") === "true");
    setPostProcessMode(
      localStorage.getItem("thehiggs_postProcessMode") === "true",
    );
    // Defer the flag to the next macrotask so that persist effects running
    // in the same batch (with stale `false` state) are skipped.
    const timer = setTimeout(() => {
      restoredRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // 持久化 AI 模式开关状态到 localStorage（仅在 restore 完成后写入）
  useEffect(() => {
    if (!restoredRef.current) return;
    localStorage.setItem("thehiggs_refineMode", String(refineMode));
  }, [refineMode]);
  useEffect(() => {
    if (!restoredRef.current) return;
    localStorage.setItem("thehiggs_thinkingMode", String(thinkingMode));
  }, [thinkingMode]);
  useEffect(() => {
    if (!restoredRef.current) return;
    localStorage.setItem("thehiggs_postProcessMode", String(postProcessMode));
  }, [postProcessMode]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed || disabled || refining) return;
      const pageLogContext = createPageLogContext(trimmed);

      if (refineMode) {
        // Two-step: refine first, then search
        setRefining(true);
        try {
          const res = await fetch("/api/refine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: trimmed, pageLogContext }),
          });
          if (!res.ok) {
            console.error("[SearchLauncher] Refine API error:", res.status);
            void postRuntimeLog(pageLogContext, {
              type: "refine.frontend.http_error",
              stage: "frontend",
              status: "failure",
              payload: { httpStatus: res.status, query: trimmed },
            });
            onSearch(
              createAppSearchEvent(trimmed, {
                thinking: thinkingMode,
                postProcess: postProcessMode,
              }),
              pageLogContext,
            );
            return;
          }
          const data = await res.json();
          if (data.ok) {
            onSearch(
              createAppSearchEvent(trimmed, {
                refine: true,
                thinking: thinkingMode,
                postProcess: postProcessMode,
                refinedPrompt: data.refinedPrompt,
                refinedContext: {
                  appKind: data.appKind,
                  appTitle: data.appTitle,
                  appDescription: data.appDescription,
                  keyFeatures: data.keyFeatures,
                  suggestedLayout: data.suggestedLayout,
                  suggestedComponents: data.suggestedComponents,
                },
              }),
              pageLogContext,
            );
          } else {
            console.error("[SearchLauncher] Refine failed:", data.error);
            void postRuntimeLog(pageLogContext, {
              type: "refine.frontend.business_failure",
              stage: "frontend",
              status: "failure",
              payload: { error: data.error, query: trimmed },
            });
            onSearch(
              createAppSearchEvent(trimmed, {
                thinking: thinkingMode,
                postProcess: postProcessMode,
              }),
              pageLogContext,
            );
          }
        } catch (err) {
          console.error("[SearchLauncher] Refine fetch error:", err);
          void postRuntimeLog(pageLogContext, {
            type: "refine.frontend.fetch_error",
            stage: "frontend",
            status: "failure",
            payload: {
              error: err instanceof Error ? err.message : String(err),
              query: trimmed,
            },
          });
          onSearch(
            createAppSearchEvent(trimmed, {
              thinking: thinkingMode,
              postProcess: postProcessMode,
            }),
            pageLogContext,
          );
        } finally {
          setRefining(false);
        }
      } else {
        console.log(
          "[SearchLauncher] Non-refine submit: postProcessMode=",
          postProcessMode,
          "thinkingMode=",
          thinkingMode,
        );
        onSearch(
          createAppSearchEvent(trimmed, {
            thinking: thinkingMode,
            postProcess: postProcessMode,
          }),
          pageLogContext,
        );
      }
    },
    [
      query,
      disabled,
      refineMode,
      thinkingMode,
      postProcessMode,
      refining,
      onSearch,
    ],
  );

  const modeSummary = [
    {
      label: "提示细化",
      value: refineMode ? "开" : "关",
      className: refineMode
        ? "border-purple-500/50 bg-purple-500/10 text-purple-200"
        : "border-neutral-800 bg-neutral-950/70 text-neutral-500",
    },
    {
      label: "深度思考",
      value: thinkingMode ? "开" : "关",
      className: thinkingMode
        ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
        : "border-neutral-800 bg-neutral-950/70 text-neutral-500",
    },
    {
      label: "质量审查",
      value: postProcessMode ? "开" : "关",
      className: postProcessMode
        ? "border-teal-500/50 bg-teal-500/10 text-teal-200"
        : "border-neutral-800 bg-neutral-950/70 text-neutral-500",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070a10] text-neutral-100">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.14),transparent_65%)]" />

      <main className="relative mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.06fr)_minmax(390px,0.94fr)] lg:items-center lg:gap-8 lg:py-10">
        <section className="flex flex-col gap-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-sm font-semibold text-cyan-200">
                TH
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-100">
                  TheHiggs
                </p>
                <p className="text-xs text-neutral-500">
                  语义 UI 运行时
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-400">
              <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1">
                v0.3.1
              </span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                49 个组件
              </span>
            </div>
          </header>

          <div className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
              AI-UI 共执行运行时
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-neutral-50 sm:text-5xl lg:text-6xl">
              让“上帝粒子”式的底层能力，生长出万能 APP。
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-400">
              TheHiggs 借用希格斯玻色子“上帝粒子”的寓意：让 AI 驻留在自己生成的 UI 中，把自然语言、语义组件和用户事件连接成可持续演化的应用底层。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["AUIR", "语义组件协议"],
              ["日志", "按页面构建记录"],
              ["模式", "细化 / 思考 / 审查"],
            ].map(([value, label]) => (
              <div
                key={value}
                className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-4"
              >
                <p className="text-2xl font-semibold text-neutral-100">
                  {value}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">
                  {label}
                </p>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-4 shadow-2xl shadow-black/30 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  启动入口
                </p>
                <h2 className="mt-1 text-lg font-semibold text-neutral-100">
                  描述你想生成的应用
                </h2>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSettings(!showSettings)}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
                    refineMode || thinkingMode || postProcessMode
                      ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-100"
                      : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-neutral-100"
                  }`}
                  title="设置"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 0 1 20.66 6l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  模式设置
                </button>

                {showSettings && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-neutral-700 bg-neutral-950 p-4 shadow-2xl">
                    <h3 className="mb-3 text-sm font-semibold text-neutral-100">
                      运行模式
                    </h3>

                    <ModeToggle
                      checked={refineMode}
                      color="purple"
                      label="AI 提示细化"
                      description="将简短输入先细化为详细提示词再生成页面"
                      onClick={() => setRefineMode(!refineMode)}
                    />
                    {refineMode && (
                      <p className="mt-2 text-[11px] leading-relaxed text-purple-300">
                        开启后，输入&ldquo;计算器&rdquo;等简短描述，AI
                        会先扩充为包含布局、组件、交互细节的完整规范。
                      </p>
                    )}

                    <div className="my-3 border-t border-neutral-800" />

                    <ModeToggle
                      checked={thinkingMode}
                      color="amber"
                      label="深度思考模式"
                      description="启用 DeepSeek 思维链推理，生成结果更深入"
                      onClick={() => setThinkingMode(!thinkingMode)}
                    />
                    {thinkingMode && (
                      <p className="mt-2 text-[11px] leading-relaxed text-amber-300">
                        开启后，每次生成 UI 时会先进行深度思考推理，适合复杂布局和精细交互。
                      </p>
                    )}

                    <div className="my-3 border-t border-neutral-800" />

                    <ModeToggle
                      checked={postProcessMode}
                      color="teal"
                      label="AI 质量复核"
                      description="生成 UI 后由第二个 AI 审查并修正界面质量"
                      onClick={() => setPostProcessMode(!postProcessMode)}
                    />
                    {postProcessMode && (
                      <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-teal-300">
                        <p>开启后，AI 生成 UI 后会由第二个 AI 进行审查：</p>
                        <ul className="list-inside list-disc space-y-0.5">
                          <li>功能审计：确保交互元素的功能与外观匹配</li>
                          <li>布局优化：改进排版、间距、视觉层级</li>
                          <li>位置稳定性：避免相同元素在多轮对话中跳动</li>
                        </ul>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowSettings(false)}
                      className="mt-4 w-full rounded-lg border border-neutral-800 bg-neutral-900 py-2 text-xs text-neutral-400 transition-colors hover:text-neutral-100"
                    >
                      关闭
                    </button>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-3 lg:flex-row">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="描述你想要的应用，例如：做一个火箭发动机循环参数分析工具..."
                  disabled={disabled || refining}
                  className="min-h-14 flex-1 rounded-lg border border-neutral-700 bg-neutral-900/90 px-4 py-3 text-base text-neutral-100 placeholder-neutral-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
                <button
                  type="submit"
                  disabled={disabled || refining || !query.trim()}
                  className={`min-h-14 rounded-lg px-5 text-sm font-semibold transition-colors lg:w-44 ${
                    refining
                      ? "cursor-wait bg-purple-600 text-white"
                      : refineMode
                        ? "bg-purple-600 text-white hover:bg-purple-500 disabled:bg-neutral-800 disabled:text-neutral-500"
                        : thinkingMode
                          ? "bg-amber-600 text-white hover:bg-amber-500 disabled:bg-neutral-800 disabled:text-neutral-500"
                          : postProcessMode
                            ? "bg-teal-600 text-white hover:bg-teal-500 disabled:bg-neutral-800 disabled:text-neutral-500"
                            : "bg-cyan-500 text-neutral-950 hover:bg-cyan-400 disabled:bg-neutral-800 disabled:text-neutral-500"
                  }`}
                >
                  {refining ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="h-3.5 w-3.5 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      正在细化...
                    </span>
                  ) : refineMode ? (
                    "细化并启动"
                  ) : thinkingMode ? (
                    "思考并启动"
                  ) : postProcessMode ? (
                    "复核并启动"
                  ) : (
                    "启动生成"
                  )}
                </button>
              </div>
            </form>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {modeSummary.map((mode) => (
                <div
                  key={mode.label}
                  className={`rounded-lg border px-3 py-2 ${mode.className}`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                    {mode.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{mode.value}</p>
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className="grid gap-4">
          <section className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  运行时流水线
                </p>
                <h2 className="mt-1 text-lg font-semibold text-neutral-100">
                  从一句需求到可交互界面
                </h2>
              </div>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">
                交互闭环
              </span>
            </div>

            <div className="grid gap-3">
              {PIPELINE_STAGES.map((stage, index) => (
                <div
                  key={stage.label}
                  className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-3"
                >
                  <div className="grid h-9 w-9 place-items-center rounded-lg border border-neutral-700 bg-neutral-900 text-xs font-semibold text-neutral-300">
                    {index + 1}
                  </div>
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
                    <p className="text-sm font-medium text-neutral-100">
                      {stage.label}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {stage.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                能力矩阵
              </p>
              <div className="mt-4 space-y-3">
                {[
                  ["语义 UI", "以 schema 约束组件树"],
                  ["本地状态", "事件快照与绑定同步"],
                  ["质量复核", "布局与功能一致性审计"],
                ].map(([label, detail]) => (
                  <div key={label}>
                    <div className="mb-1 flex justify-between gap-3 text-xs">
                      <span className="font-medium text-neutral-200">
                        {label}
                      </span>
                      <span className="text-neutral-500">就绪</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-neutral-800">
                      <div className="h-full rounded-full bg-emerald-400" />
                    </div>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      {detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                系统信号
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["页面日志", "逐页构建"],
                  ["渲染器", "React 19"],
                  ["结构校验", "Zod"],
                  ["运行框架", "Next 15"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
                  >
                    <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-neutral-100">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                  示例需求
                </p>
                <h2 className="mt-1 text-lg font-semibold text-neutral-100">
                  从一个领域模式开始
                </h2>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  disabled={disabled || refining}
                  onClick={() => {
                    setQuery(ex.query);
                  }}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-left transition-colors hover:border-cyan-500/50 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="block text-sm font-medium text-neutral-100">
                    {ex.label}
                  </span>
                  <span className="mt-1 block text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                    {ex.meta}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

function ModeToggle({
  checked,
  color,
  label,
  description,
  onClick,
}: {
  checked: boolean;
  color: "purple" | "amber" | "teal";
  label: string;
  description: string;
  onClick: () => void;
}) {
  const activeClass = {
    purple: "bg-purple-600",
    amber: "bg-amber-600",
    teal: "bg-teal-600",
  }[color];

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-neutral-200">{label}</p>
        <p className="mt-0.5 text-[11px] text-neutral-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onClick}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          checked ? activeClass : "bg-neutral-700"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function createPageLogContext(initialQuery: string): PageLogContext {
  return {
    pageLogId: `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pageStartedAt: new Date().toISOString(),
    initialQuery,
  };
}
