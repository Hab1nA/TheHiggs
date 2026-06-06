/**
 * TheHiggs — AI-UI Co-Execution Runtime
 *
 * 入口页面：App Launcher 搜索框
 * 用户输入想要的应用描述，AI 生成结构化 UI 状态，前端渲染并进入共执行循环。
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-4">TheHiggs</h1>
      <p className="text-lg text-muted mb-8">
        AI-UI Co-Execution Runtime
      </p>
      {/* App Launcher — 后续实现 */}
      <div className="w-full max-w-xl">
        <input
          type="text"
          placeholder="描述你想要的应用，例如：做一个火箭发动机循环参数分析工具..."
          className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-lg"
          disabled
        />
      </div>
    </main>
  );
}
