// ============================================================
// SearchLauncher — App Launcher 搜索框
// ============================================================

"use client";

import type { AUIREvent } from "@/auir/types";
import { postRuntimeLog } from "@/runtime/client";
import { createAppSearchEvent } from "@/runtime/event";
import type { PageLogContext } from "@/runtime/logging/types";
import { useCallback, useEffect, useState, type FormEvent } from "react";

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

  // 从 localStorage 恢复 AI 模式开关状态（仅客户端，避免 SSR Hydration 不一致）
  useEffect(() => {
    setRefineMode(localStorage.getItem("thehiggs_refineMode") === "true");
    setThinkingMode(localStorage.getItem("thehiggs_thinkingMode") === "true");
    setPostProcessMode(localStorage.getItem("thehiggs_postProcessMode") === "true");
  }, []);

  // 持久化 AI 模式开关状态到 localStorage
  useEffect(() => {
    localStorage.setItem("thehiggs_refineMode", String(refineMode));
  }, [refineMode]);
  useEffect(() => {
    localStorage.setItem("thehiggs_thinkingMode", String(thinkingMode));
  }, [thinkingMode]);
  useEffect(() => {
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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
        TheHiggs
      </h1>
      <div className="flex gap-2 mb-3">
        <span className="inline-flex items-center rounded-full border border-blue-700 bg-blue-950/50 px-2 py-0.5 text-[10px] font-medium text-blue-300">
          v0.3.1
        </span>
        <span className="inline-flex items-center rounded-full border border-green-700 bg-green-950/50 px-2 py-0.5 text-[10px] font-medium text-green-300">
          49 Components
        </span>
      </div>
      <p className="text-lg text-neutral-400 mb-2">
        AI-UI Co-Execution Runtime
      </p>
      <p className="text-sm text-neutral-500 mb-6 max-w-md text-center">
        AI 驻留在自己生成的 UI 中。描述你想要的应用，AI
        将为你构建一个语义交互界面。
      </p>

      {/* Settings button */}
      <div className="relative mb-4">
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-lg border transition-colors ${
            refineMode || thinkingMode || postProcessMode
              ? "border-purple-600 bg-purple-950/40 text-purple-300"
              : "border-neutral-800 bg-neutral-900/50 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700"
          }`}
          title="Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* Settings dropdown */}
        {showSettings && (
          <div className="absolute top-full mt-2 right-0 w-72 rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl p-4 z-50">
            <h3 className="text-sm font-semibold text-neutral-200 mb-3">
              ⚙️ Settings
            </h3>

            {/* Refine Mode toggle */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm text-neutral-300 font-medium">
                  🤖 AI Refine Mode
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  将简短输入先细化为详细提示词再生成页面
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={refineMode}
                onClick={() => setRefineMode(!refineMode)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  refineMode ? "bg-purple-600" : "bg-neutral-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    refineMode ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {refineMode && (
              <p className="text-[11px] text-purple-400 mt-2 leading-relaxed">
                ✨ 开启后，输入&ldquo;计算器&rdquo;等简短描述，AI
                会先将其扩充为包含布局、组件、交互细节的完整规范，
                再基于细化后的规范生成更丰富的界面。
              </p>
            )}

            {/* Divider */}
            <div className="my-3 border-t border-neutral-800" />

            {/* Thinking Mode toggle */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm text-neutral-300 font-medium">
                  🧠 Thinking Mode
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  启用 DeepSeek 思维链推理，生成结果更深入
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={thinkingMode}
                onClick={() => setThinkingMode(!thinkingMode)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  thinkingMode ? "bg-amber-600" : "bg-neutral-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    thinkingMode ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {thinkingMode && (
              <p className="text-[11px] text-amber-400 mt-2 leading-relaxed">
                🧠 开启后，每次生成 UI 时 AI
                都会先进行深度思考推理，生成质量更高但速度稍慢。
                适合需要复杂布局和精细交互的场景。
              </p>
            )}

            {/* Divider */}
            <div className="my-3 border-t border-neutral-800" />

            {/* Post-Process Mode toggle */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm text-neutral-300 font-medium">
                  🔍 AI Post-Process Mode
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  生成 UI 后由第二个 AI 审查并修正界面质量
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={postProcessMode}
                onClick={() => setPostProcessMode(!postProcessMode)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  postProcessMode ? "bg-teal-600" : "bg-neutral-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    postProcessMode ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {postProcessMode && (
              <div className="text-[11px] text-teal-400 mt-2 leading-relaxed space-y-1">
                <p>🔍 开启后，AI 生成 UI 后会由第二个 AI 进行三方面审查：</p>
                <ul className="list-disc list-inside ml-1 space-y-0.5">
                  <li>
                    <strong>功能审计</strong> —
                    确保按钮/输入框等交互元素的功能与外观匹配
                  </li>
                  <li>
                    <strong>布局优化</strong> — 改进排版、间距、视觉层级
                  </li>
                  <li>
                    <strong>位置稳定性</strong> —
                    保持相同元素在相同位置，避免界面跳动
                  </li>
                </ul>
                <p className="mt-1 text-teal-500">
                  ⚠️ 会增加一次额外的 AI 调用，生成速度稍慢。
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="mt-3 w-full py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="描述你想要的应用，例如：做一个火箭发动机循环参数分析工具..."
          disabled={disabled || refining}
          className="w-full px-5 py-4 rounded-xl border border-neutral-700 bg-neutral-900 text-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        />
        <div className="mt-3 text-center">
          <button
            type="submit"
            disabled={disabled || refining || !query.trim()}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              refining
                ? "bg-purple-600 text-white cursor-wait"
                : refineMode
                  ? "bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white"
                  : thinkingMode
                    ? "bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white"
                    : postProcessMode
                      ? "bg-teal-600 hover:bg-teal-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white"
                      : "bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white"
            }`}
          >
            {refining ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-3.5 w-3.5"
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
                Refining...
              </span>
            ) : refineMode ? (
              "✨ Refine & Launch"
            ) : thinkingMode ? (
              "🧠 Think & Launch"
            ) : postProcessMode ? (
              "🔍 Review & Launch"
            ) : (
              "Launch"
            )}
          </button>
        </div>
      </form>
      <div className="mt-8 max-w-xl w-full">
        <p className="text-xs text-neutral-600 mb-3 text-center">
          Try these examples
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {[
            {
              label: "📊 数据看板",
              query: "Dashboard with revenue metrics and user analytics",
            },
            {
              label: "📋 项目管理",
              query: "Project tracker with milestones and timeline",
            },
            { label: "💪 健康追踪", query: "Health & fitness tracker" },
            { label: "🎨 组件展示", query: "Showcase all components demo" },
            {
              label: "📈 转化分析",
              query: "Conversion funnel analytics with heatmaps",
            },
            { label: "🚀 火箭引擎", query: "Rocket engine cycle analyzer" },
          ].map((ex) => (
            <button
              key={ex.label}
              type="button"
              disabled={disabled || refining}
              onClick={() => {
                setQuery(ex.query);
              }}
              className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>
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
