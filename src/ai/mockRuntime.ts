// ============================================================
// Mock AI Runtime — 无需 API Key 的模拟 Runtime
// ============================================================

import { exampleRocketCycleResponse } from "@/auir/examples";
import { createLauncherState } from "@/auir/fallback";
import type { AUIRRequest, AUIRResponse, AUIRState } from "@/auir/types";
import { executeToolSync } from "./tools";

/** Mock AI Runtime：根据事件类型生成演示响应 */
export async function mockGenerateNextAUIRState(
  request: AUIRRequest,
): Promise<AUIRResponse> {
  const { event, previous, session } = request;

  // Handle restart / back_to_launcher
  if (event.type === "runtime.command") {
    if (event.command === "restart" || event.command === "back_to_launcher") {
      return {
        protocol: "AUIR",
        version: "0.3",
        next: createLauncherState(),
        diagnostics: {
          eventInterpretedAs: "User requested restart",
          stateTransition: "any -> launcher",
        },
      };
    }
  }

  // Handle app.search — return the rocket cycle analyzer demo
  if (event.type === "app.search") {
    const query = event.query.toLowerCase();
    if (
      query.includes("rocket") ||
      query.includes("engine") ||
      query.includes("cycle") ||
      query.includes("火箭") ||
      query.includes("发动机")
    ) {
      const response = exampleRocketCycleResponse();
      // Update session info
      response.next.memory.session = {
        ...response.next.memory.session,
        currentTask: `Analyze: ${event.query}`,
      };
      if (response.diagnostics) {
        response.diagnostics.eventInterpretedAs = `User searched for: "${event.query}"`;
        response.diagnostics.stateTransition =
          "launcher -> rocket_engine_cycle_analyzer";
        response.diagnostics.simulatedData = true;
      }
      return response;
    }

    // Generic fallback: return a simple dashboard for any query
    return createGenericDashboardResponse(event.query);
  }

  // Handle component.click with calculate/compare buttons
  if (event.type === "component.click") {
    const intent = event.target.intent ?? "";
    const clickId = event.target.id ?? "";

    // Read clientSnapshot for latest local values
    const localValues = event.clientSnapshot?.localState?.values ?? {};

    if (
      intent === "calculate_engine_performance" ||
      clickId === "calc_button"
    ) {
      return handleCalculatePerformance(previous, localValues, session);
    }

    if (intent === "compare_cycle_options" || clickId === "compare_button") {
      return handleCompareCycles(previous, localValues);
    }
  }

  // Default: return previous state with minimal change
  if (previous) {
    return {
      protocol: "AUIR",
      version: "0.3",
      next: previous,
      diagnostics: {
        eventInterpretedAs: `Event "${event.type}" handled with no change`,
        warnings: ["Mock runtime: no specific handler for this event"],
      },
    };
  }

  // Fallback to launcher
  return {
    protocol: "AUIR",
    version: "0.3",
    next: createLauncherState(),
    diagnostics: {
      eventInterpretedAs: "Unhandled event, returning to launcher",
    },
  };
}

/** 处理 Calculate Performance */
function handleCalculatePerformance(
  previous: AUIRState | null,
  localValues: Record<string, unknown>,
  session: AUIRRequest["session"],
): AUIRResponse {
  const base = previous ?? exampleRocketCycleResponse().next;

  // Read local values (user's edits)
  const Pc = Number(localValues["app.inputs.chamberPressureMPa"] ?? 12);
  const MR = Number(localValues["app.inputs.mixtureRatio"] ?? 5.8);
  const eps = Number(localValues["app.inputs.expansionRatio"] ?? 80);
  const cycleType = String(
    localValues["app.inputs.cycleType"] ?? "staged_combustion",
  );

  // Estimate using safeCalculator-style logic
  const toolResult = executeToolSync("estimateRocketCycle", {
    chamberPressureMPa: Pc,
    mixtureRatio: MR,
    expansionRatio: eps,
    cycleType,
  });

  const estimates = toolResult.result as Record<string, number>;

  // Update app memory with latest inputs
  const appMemory = {
    ...((base.memory?.app as Record<string, unknown>) ?? {}),
    simulated: true,
    inputs: {
      chamberPressureMPa: Pc,
      mixtureRatio: MR,
      expansionRatio: eps,
      cycleType,
    },
    results: estimates,
  };

  // Update UI metrics
  const nextState: AUIRState = JSON.parse(JSON.stringify(base));
  nextState.memory.app = appMemory;
  nextState.memory.session = {
    ...((nextState.memory?.session as Record<string, unknown>) ?? {}),
    currentTask: "Performance calculated with user-provided inputs",
    turn: session.turn,
  };

  // Walk UI tree and update metric values
  updateMetricInTree(nextState.ui, "isp_metric", estimates.ispVac_s ?? 452);
  updateMetricInTree(
    nextState.ui,
    "mass_flow_metric",
    estimates.massFlow_kgs ?? 245,
  );
  updateMetricInTree(
    nextState.ui,
    "thrust_metric",
    estimates.thrust_kN ?? 1100,
  );
  updateMetricInTree(
    nextState.ui,
    "exit_vel_metric",
    estimates.exitVelocity_ms ?? 4430,
  );

  // Update local_value_display bindings
  updateBindingInTree(nextState.ui, "app.inputs.chamberPressureMPa", Pc);
  updateBindingInTree(nextState.ui, "app.inputs.mixtureRatio", MR);
  updateBindingInTree(nextState.ui, "app.inputs.expansionRatio", eps);
  updateBindingInTree(nextState.ui, "app.inputs.cycleType", cycleType);

  return {
    protocol: "AUIR",
    version: "0.3",
    next: nextState,
    diagnostics: {
      eventInterpretedAs: "User clicked Calculate Performance",
      stateTransition: "updated metrics with local input values",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

/** 处理 Compare Cycles */
function handleCompareCycles(
  previous: AUIRState | null,
  localValues: Record<string, unknown>,
): AUIRResponse {
  const base = previous ?? exampleRocketCycleResponse().next;

  const Pc = Number(localValues["app.inputs.chamberPressureMPa"] ?? 12);
  const MR = Number(localValues["app.inputs.mixtureRatio"] ?? 5.8);
  const eps = Number(localValues["app.inputs.expansionRatio"] ?? 80);

  // Generate comparison data for 3 cycles
  const cycles = ["gas_generator", "expander", "staged_combustion"];
  const labels = ["Gas Generator", "Expander", "Staged Combustion"];
  const results = cycles.map((cycle) => {
    const r = executeToolSync("estimateRocketCycle", {
      chamberPressureMPa: Pc,
      mixtureRatio: MR,
      expansionRatio: eps,
      cycleType: cycle,
    });
    return r.result as Record<string, number>;
  });

  const nextState: AUIRState = JSON.parse(JSON.stringify(base));

  // Replace results panel with comparison table + chart
  // Find results_panel and replace children
  replaceNodeInTree(nextState.ui, "results_panel", {
    id: "results_panel",
    type: "panel",
    title: "Cycle Comparison",
    children: [
      {
        id: "comparison_table",
        type: "table",
        columns: [
          "Cycle",
          "Isp (s)",
          "Mass Flow (kg/s)",
          "Thrust (kN)",
          "Exit Velocity (m/s)",
        ],
        rows: cycles.map((_, i) => [
          labels[i],
          results[i].ispVac_s ?? 0,
          results[i].massFlow_kgs ?? 0,
          results[i].thrust_kN ?? 0,
          results[i].exitVelocity_ms ?? 0,
        ]),
      },
      {
        id: "comparison_chart",
        type: "chart_bar",
        title: "Isp Comparison",
        xLabel: "Cycle",
        yLabel: "Vacuum Isp (s)",
        data: cycles.map((_, i) => ({
          label: labels[i],
          value: results[i].ispVac_s ?? 0,
        })),
      },
      {
        id: "back_to_params",
        type: "button",
        label: "Back to Parameters",
        intent: "back_to_parameters",
        variant: "secondary",
        semanticRole: "navigation",
        interaction: {
          mode: "ai_transition",
          commitOn: ["click"],
        },
      },
    ],
  });

  nextState.memory.app = {
    ...((nextState.memory.app as Record<string, unknown>) ?? {}),
    comparisonResults: results,
    comparingCycles: true,
  };

  return {
    protocol: "AUIR",
    version: "0.3",
    next: nextState,
    diagnostics: {
      eventInterpretedAs: "User clicked Compare Cycles",
      stateTransition: "comparison view generated",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

/** 创建通用 dashboard 响应 — 根据查询关键词匹配不同 UI 模板 */
function createGenericDashboardResponse(query: string): AUIRResponse {
  const lower = query.toLowerCase();
  const appId = `app_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Detect app kind and generate appropriate UI
  // Order matters: more specific checks (health, code, task) before general (dashboard)
  if (
    containsAny(lower, [
      "showcase",
      "demo",
      "演示",
      "展示",
      "all components",
      "所有组件",
    ])
  ) {
    return buildShowcaseApp(appId, query);
  }
  if (
    containsAny(lower, [
      "health",
      "fitness",
      "workout",
      "健康",
      "健身",
      "运动",
      "medical",
      "医疗",
    ])
  ) {
    return buildHealthTrackerApp(appId, query);
  }
  if (
    containsAny(lower, [
      "task",
      "todo",
      "kanban",
      "checklist",
      "任务",
      "待办",
      "清单",
    ])
  ) {
    return buildTaskManagerApp(appId, query);
  }
  if (
    containsAny(lower, [
      "code",
      "editor",
      "syntax",
      "programming",
      "ide",
      "代码",
      "编辑器",
      "编程",
    ])
  ) {
    return buildCodeEditorApp(appId, query);
  }
  if (containsAny(lower, ["calculator", "converter", "计算器", "转换"])) {
    return buildCalculatorApp(appId, query);
  }
  if (
    containsAny(lower, [
      "data",
      "table",
      "csv",
      "spreadsheet",
      "excel",
      "数据",
      "表格",
    ])
  ) {
    return buildDataTableApp(appId, query);
  }
  if (
    containsAny(lower, [
      "note",
      "text",
      "document",
      "writer",
      "笔记",
      "文档",
      "写作",
    ])
  ) {
    return buildNotesApp(appId, query);
  }
  if (
    containsAny(lower, [
      "project",
      "timeline",
      "gantt",
      "milestone",
      "项目",
      "进度",
      "里程碑",
    ])
  ) {
    return buildProjectTrackerApp(appId, query);
  }
  if (
    containsAny(lower, [
      "analytics",
      "insight",
      "funnel",
      "retention",
      "分析",
      "洞察",
    ])
  ) {
    return buildAnalyticsApp(appId, query);
  }
  if (
    containsAny(lower, [
      "dashboard",
      "metric",
      "chart",
      "report",
      "统计",
      "报表",
      "图表",
      "监控",
    ])
  ) {
    return buildDashboardApp(appId, query);
  }

  // Default: engineering/utility tool
  return buildGenericUtilityApp(appId, query);
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

// -----------------------------------------------------------
// App Templates
// -----------------------------------------------------------

function buildDashboardApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: appId,
        title: formatTitle(query),
        kind: "dashboard",
        description: `Generated dashboard for: ${query}`,
      },
      memory: {
        app: { simulated: true, query },
        session: { currentTask: query, currentView: "main" },
      },
      ui: {
        id: "dashboard_screen",
        type: "screen",
        title: formatTitle(query),
        layoutMode: "dashboard",
        children: [
          {
            id: "header",
            type: "region",
            region: "header",
            children: [
              {
                id: "breadcrumb_nav",
                type: "breadcrumb",
                items: [
                  { label: "Home" },
                  { label: "Dashboards" },
                  { label: formatTitle(query) },
                ],
                separator: "/",
              },
              {
                id: "title",
                type: "heading",
                level: 1,
                text: formatTitle(query),
                semanticRole: "display",
              },
              {
                id: "header_tags",
                type: "container",
                direction: "row",
                gap: "sm",
                children: [
                  {
                    id: "tag_live",
                    type: "badge",
                    text: "Live",
                    variant: "success",
                    size: "sm",
                  },
                  {
                    id: "tag_sim",
                    type: "badge",
                    text: "Simulated",
                    variant: "warning",
                    size: "sm",
                  },
                ],
              },
              {
                id: "reset_btn",
                type: "button",
                label: "Reset",
                intent: "restart_runtime",
                variant: "ghost",
                semanticRole: "navigation",
                interaction: { mode: "ai_transition", commitOn: ["click"] },
              },
            ],
          },
          {
            id: "kpi_row",
            type: "stat_group",
            columns: 4,
            gap: "md",
            items: [
              {
                id: "kpi1",
                label: "Total Revenue",
                value: "$84.7K",
                trend: "up",
                trendValue: "+12.5%",
              },
              {
                id: "kpi2",
                label: "Active Users",
                value: "12,453",
                trend: "up",
                trendValue: "+8.3%",
              },
              {
                id: "kpi3",
                label: "Conversion",
                value: "3.42%",
                trend: "down",
                trendValue: "-0.5%",
              },
              {
                id: "kpi4",
                label: "Uptime",
                value: "99.97%",
                trend: "stable",
                trendValue: "0%",
              },
            ],
          },
          {
            id: "main_split",
            type: "split",
            orientation: "horizontal",
            ratio: "2:1",
            primary: {
              id: "main_col",
              type: "container",
              direction: "column",
              gap: "md",
              children: [
                {
                  id: "chart_panel",
                  type: "panel",
                  title: "Performance Trends",
                  children: [
                    {
                      id: "revenue_chart",
                      type: "chart_line",
                      title: "Monthly Revenue",
                      xLabel: "Month",
                      yLabel: "Revenue (USD)",
                      data: [
                        { x: "Jan", y: 8200 },
                        { x: "Feb", y: 9100 },
                        { x: "Mar", y: 8500 },
                        { x: "Apr", y: 10200 },
                        { x: "May", y: 9700 },
                        { x: "Jun", y: 11200 },
                      ],
                    },
                  ],
                },
                {
                  id: "progress_grid",
                  type: "grid",
                  columns: 2,
                  gap: "md",
                  children: [
                    {
                      id: "prog1",
                      type: "progress",
                      label: "Server Load",
                      value: 67,
                      max: 100,
                      unit: "%",
                      tone: "warning",
                    },
                    {
                      id: "prog2",
                      type: "progress",
                      label: "Storage",
                      value: 42,
                      max: 100,
                      unit: "%",
                      tone: "primary",
                    },
                    {
                      id: "prog3",
                      type: "progress",
                      label: "Bandwidth",
                      value: 88,
                      max: 100,
                      unit: "%",
                      tone: "danger",
                    },
                    {
                      id: "prog4",
                      type: "progress",
                      label: "Cache Hit",
                      value: 94,
                      max: 100,
                      unit: "%",
                      tone: "success",
                    },
                  ],
                },
              ],
            },
            secondary: {
              id: "side_col",
              type: "container",
              direction: "column",
              gap: "md",
              children: [
                {
                  id: "kpi_card_main",
                  type: "kpi_card",
                  title: "Satisfaction Score",
                  value: 94,
                  unit: "%",
                  trend: "up",
                  trendValue: "+2.1%",
                  tone: "success",
                  description: "Based on 2,847 responses",
                },
                {
                  id: "stat_avg",
                  type: "statistic",
                  title: "Avg Response Time",
                  value: 234,
                  suffix: "ms",
                  trend: "down",
                  trendValue: "-12ms",
                },
                {
                  id: "stat_err",
                  type: "statistic",
                  title: "Error Rate",
                  value: 0.12,
                  suffix: "%",
                  trend: "up",
                  trendValue: "+0.03%",
                },
                {
                  id: "timeline_panel",
                  type: "panel",
                  title: "Recent Activity",
                  children: [
                    {
                      id: "activity_timeline",
                      type: "timeline",
                      items: [
                        {
                          id: "evt1",
                          title: "Deployment v2.4.1",
                          description: "Rolled out to production",
                          timestamp: "10 min ago",
                          tone: "success",
                          icon: "✓",
                        },
                        {
                          id: "evt2",
                          title: "Alert: CPU spike",
                          description: "Server us-east-1 at 92%",
                          timestamp: "1 hour ago",
                          tone: "warning",
                          icon: "!",
                        },
                        {
                          id: "evt3",
                          title: "Backup completed",
                          description: "Daily snapshot saved",
                          timestamp: "3 hours ago",
                          tone: "default",
                          icon: "●",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
          {
            id: "details_accordion",
            type: "accordion",
            defaultOpenIndex: -1,
            items: [
              {
                id: "acc_perf",
                title: "Performance Details",
                children: [
                  {
                    id: "perf_table",
                    type: "table",
                    columns: ["Endpoint", "P50", "P95", "P99", "Requests/min"],
                    rows: [
                      ["/api/users", "45ms", "120ms", "230ms", 1200],
                      ["/api/orders", "78ms", "200ms", "450ms", 890],
                      ["/api/products", "32ms", "85ms", "150ms", 3400],
                      ["/api/search", "120ms", "350ms", "680ms", 560],
                    ],
                  },
                ],
              },
              {
                id: "acc_errors",
                title: "Error Log",
                children: [
                  {
                    id: "error_list",
                    type: "list",
                    gap: "sm",
                    items: [
                      {
                        id: "err1",
                        text: "Timeout on /api/export",
                        description: "3 occurrences in last hour",
                        tone: "danger",
                        icon: "✕",
                      },
                      {
                        id: "err2",
                        text: "Rate limit exceeded",
                        description: "Affected 12 users",
                        tone: "warning",
                        icon: "⚠",
                      },
                      {
                        id: "err3",
                        text: "Cache invalidation delayed",
                        description: "Minor latency impact",
                        tone: "muted",
                        icon: "●",
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "warning",
            type: "alert",
            tone: "warning",
            title: "Simulated Data",
            message: "This is a demo dashboard. All values are simulated.",
            semanticRole: "warning",
          },
        ],
      },
    },
    diagnostics: {
      eventInterpretedAs: `User searched: "${query}"`,
      stateTransition: "launcher -> dashboard",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

function buildTaskManagerApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: appId,
        title: formatTitle(query),
        kind: "productivity_tool",
        description: `Generated task manager for: ${query}`,
      },
      memory: {
        app: {
          simulated: true,
          query,
          tasks: [
            {
              id: "t1",
              title: "Design system architecture",
              status: "done",
              priority: "high",
            },
            {
              id: "t2",
              title: "Implement core modules",
              status: "in_progress",
              priority: "high",
            },
            {
              id: "t3",
              title: "Write unit tests",
              status: "pending",
              priority: "medium",
            },
            {
              id: "t4",
              title: "Update documentation",
              status: "pending",
              priority: "low",
            },
            {
              id: "t5",
              title: "Code review feedback",
              status: "in_progress",
              priority: "medium",
            },
          ],
        },
        session: { currentTask: query, currentView: "board" },
      },
      ui: {
        id: "task_screen",
        type: "screen",
        title: formatTitle(query),
        layoutMode: "workspace",
        children: [
          {
            id: "task_header",
            type: "region",
            region: "header",
            children: [
              {
                id: "task_title",
                type: "heading",
                level: 1,
                text: formatTitle(query),
                semanticRole: "display",
              },
              {
                id: "add_task_btn",
                type: "button",
                label: "+ New Task",
                intent: "create_task",
                variant: "primary",
                semanticRole: "analysis_action",
                interaction: { mode: "ai_transition", commitOn: ["click"] },
              },
              {
                id: "reset_btn",
                type: "button",
                label: "Reset",
                intent: "restart_runtime",
                variant: "ghost",
                semanticRole: "navigation",
                interaction: { mode: "ai_transition", commitOn: ["click"] },
              },
            ],
          },
          {
            id: "task_table",
            type: "table",
            columns: ["#", "Task", "Status", "Priority"],
            rows: [
              [1, "Design system architecture", "Done", "High"],
              [2, "Implement core modules", "In Progress", "High"],
              [3, "Write unit tests", "Pending", "Medium"],
              [4, "Update documentation", "Pending", "Low"],
              [5, "Code review feedback", "In Progress", "Medium"],
            ],
          },
          {
            id: "task_input_section",
            type: "panel",
            title: "Quick Add",
            children: [
              {
                id: "new_task_input",
                type: "text_input",
                label: "Task name",
                placeholder: "Enter a new task...",
                binding: "app.inputs.newTask",
                semanticRole: "input",
                interaction: { mode: "local" },
              },
              {
                id: "priority_select",
                type: "select",
                label: "Priority",
                value: "medium",
                binding: "app.inputs.taskPriority",
                options: [
                  { label: "High", value: "high" },
                  { label: "Medium", value: "medium" },
                  { label: "Low", value: "low" },
                ],
                semanticRole: "input",
                interaction: { mode: "local" },
              },
              {
                id: "submit_task_btn",
                type: "button",
                label: "Add Task",
                intent: "add_task",
                variant: "primary",
                semanticRole: "analysis_action",
                interaction: {
                  mode: "ai_transition",
                  commitOn: ["click"],
                  includeLocalStateOnCommit: true,
                },
              },
            ],
          },
          {
            id: "task_warning",
            type: "alert",
            tone: "warning",
            title: "Simulated Data",
            message: "This is a demo task manager. Tasks are simulated.",
            semanticRole: "warning",
          },
        ],
      },
    },
    diagnostics: {
      eventInterpretedAs: `User searched: "${query}"`,
      stateTransition: "launcher -> task_manager",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

function buildCodeEditorApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: appId,
        title: formatTitle(query),
        kind: "utility",
        description: `Generated code editor for: ${query}`,
      },
      memory: {
        app: { simulated: true, query },
        session: { currentTask: query, currentView: "editor" },
      },
      ui: {
        id: "editor_screen",
        type: "screen",
        title: formatTitle(query),
        layoutMode: "workspace",
        children: [
          {
            id: "editor_header",
            type: "region",
            region: "header",
            children: [
              {
                id: "editor_title",
                type: "heading",
                level: 1,
                text: formatTitle(query),
                semanticRole: "display",
              },
              {
                id: "run_btn",
                type: "button",
                label: "Run",
                intent: "run_code",
                variant: "primary",
                semanticRole: "analysis_action",
                interaction: {
                  mode: "ai_transition",
                  commitOn: ["click"],
                  includeLocalStateOnCommit: true,
                },
              },
              {
                id: "reset_btn",
                type: "button",
                label: "Reset",
                intent: "restart_runtime",
                variant: "ghost",
                semanticRole: "navigation",
                interaction: { mode: "ai_transition", commitOn: ["click"] },
              },
            ],
          },
          {
            id: "lang_select",
            type: "select",
            label: "Language",
            value: "typescript",
            binding: "app.inputs.language",
            options: [
              { label: "TypeScript", value: "typescript" },
              { label: "Python", value: "python" },
              { label: "JavaScript", value: "javascript" },
              { label: "Rust", value: "rust" },
            ],
            semanticRole: "input",
            interaction: { mode: "local" },
          },
          {
            id: "code_textarea",
            type: "textarea",
            label: "Code",
            binding: "app.inputs.code",
            interaction: { mode: "local" },
          },
          {
            id: "code_display",
            type: "code_block",
            language: "typescript",
            code: "function fibonacci(n: number): number {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nconsole.log(fibonacci(10)); // 55",
          },
          {
            id: "editor_warning",
            type: "alert",
            tone: "warning",
            title: "Simulated Editor",
            message: "This is a demo code viewer. Code is not executed.",
            semanticRole: "warning",
          },
        ],
      },
    },
    diagnostics: {
      eventInterpretedAs: `User searched: "${query}"`,
      stateTransition: "launcher -> code_editor",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

function buildDataTableApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: appId,
        title: formatTitle(query),
        kind: "utility",
        description: `Generated data table for: ${query}`,
      },
      memory: {
        app: { simulated: true, query },
        session: { currentTask: query, currentView: "table" },
      },
      ui: {
        id: "datatable_screen",
        type: "screen",
        title: formatTitle(query),
        layoutMode: "workspace",
        children: [
          {
            id: "dt_header",
            type: "region",
            region: "header",
            children: [
              {
                id: "dt_title",
                type: "heading",
                level: 1,
                text: formatTitle(query),
                semanticRole: "display",
              },
              {
                id: "filter_input",
                type: "text_input",
                label: "Filter",
                placeholder: "Search rows...",
                binding: "app.inputs.filter",
                semanticRole: "input",
                interaction: { mode: "local" },
              },
              {
                id: "export_btn",
                type: "button",
                label: "Export CSV",
                intent: "export_csv",
                variant: "secondary",
                semanticRole: "analysis_action",
                interaction: { mode: "ai_transition", commitOn: ["click"] },
              },
              {
                id: "reset_btn",
                type: "button",
                label: "Reset",
                intent: "restart_runtime",
                variant: "ghost",
                semanticRole: "navigation",
                interaction: { mode: "ai_transition", commitOn: ["click"] },
              },
            ],
          },
          {
            id: "data_table",
            type: "table",
            columns: ["ID", "Name", "Category", "Value", "Status"],
            rows: [
              [1, "Product A", "Electronics", "$1,200", "Active"],
              [2, "Product B", "Clothing", "$450", "Active"],
              [3, "Product C", "Food", "$89", "Inactive"],
              [4, "Product D", "Electronics", "$2,100", "Active"],
              [5, "Product E", "Books", "$24", "Active"],
              [6, "Product F", "Clothing", "$670", "Active"],
              [7, "Product G", "Electronics", "$590", "Inactive"],
              [8, "Product H", "Food", "$145", "Active"],
            ],
          },
          {
            id: "dt_stats",
            type: "grid",
            columns: 3,
            children: [
              {
                id: "total_rows",
                type: "metric",
                label: "Total Rows",
                value: 8,
                confidence: "simulated",
              },
              {
                id: "active_count",
                type: "metric",
                label: "Active",
                value: 6,
                confidence: "simulated",
              },
              {
                id: "total_value",
                type: "metric",
                label: "Total Value",
                value: 5268,
                unit: "USD",
                confidence: "simulated",
              },
            ],
          },
          {
            id: "dt_warning",
            type: "alert",
            tone: "warning",
            title: "Simulated Data",
            message: "This is a demo data table. Data is simulated.",
            semanticRole: "warning",
          },
        ],
      },
    },
    diagnostics: {
      eventInterpretedAs: `User searched: "${query}"`,
      stateTransition: "launcher -> data_table",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

function buildHealthTrackerApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: appId,
        title: formatTitle(query),
        kind: "utility",
        description: `Generated health tracker for: ${query}`,
      },
      memory: {
        app: { simulated: true, query },
        session: { currentTask: query, currentView: "tracker" },
      },
      ui: {
        id: "health_screen",
        type: "screen",
        title: formatTitle(query),
        layoutMode: "dashboard",
        children: [
          {
            id: "health_header",
            type: "region",
            region: "header",
            children: [
              {
                id: "health_title",
                type: "heading",
                level: 1,
                text: formatTitle(query),
                semanticRole: "display",
              },
              {
                id: "header_tags",
                type: "container",
                direction: "row",
                gap: "sm",
                children: [
                  {
                    id: "tag_active",
                    type: "badge",
                    text: "Tracking",
                    variant: "success",
                    size: "sm",
                  },
                  {
                    id: "tag_goal",
                    type: "tag",
                    text: "Goal: 10K steps",
                    variant: "primary",
                    size: "sm",
                  },
                ],
              },
              {
                id: "log_btn",
                type: "button",
                label: "Log Entry",
                intent: "log_health",
                variant: "primary",
                semanticRole: "analysis_action",
                interaction: {
                  mode: "ai_transition",
                  commitOn: ["click"],
                  includeLocalStateOnCommit: true,
                },
              },
              {
                id: "reset_btn",
                type: "button",
                label: "Reset",
                intent: "restart_runtime",
                variant: "ghost",
                semanticRole: "navigation",
                interaction: { mode: "ai_transition", commitOn: ["click"] },
              },
            ],
          },
          {
            id: "health_kpi_grid",
            type: "stat_group",
            columns: 4,
            gap: "md",
            items: [
              {
                id: "hr_kpi",
                label: "Heart Rate",
                value: 72,
                unit: "bpm",
                trend: "stable",
              },
              {
                id: "steps_kpi",
                label: "Steps Today",
                value: "8,432",
                trend: "up",
                trendValue: "+1,200",
              },
              {
                id: "sleep_kpi",
                label: "Sleep",
                value: "7.5h",
                trend: "down",
                trendValue: "-0.5h",
              },
              {
                id: "cal_kpi",
                label: "Calories",
                value: "2,180",
                unit: "kcal",
                trend: "up",
                trendValue: "+340",
              },
            ],
          },
          {
            id: "main_split",
            type: "split",
            orientation: "horizontal",
            ratio: "2:1",
            primary: {
              id: "left_col",
              type: "container",
              direction: "column",
              gap: "md",
              children: [
                {
                  id: "weekly_chart",
                  type: "chart_line",
                  title: "Weekly Steps",
                  xLabel: "Day",
                  yLabel: "Steps",
                  data: [
                    { x: "Mon", y: 9200 },
                    { x: "Tue", y: 7800 },
                    { x: "Wed", y: 10500 },
                    { x: "Thu", y: 6400 },
                    { x: "Fri", y: 8900 },
                    { x: "Sat", y: 11200 },
                    { x: "Sun", y: 7200 },
                  ],
                },
                {
                  id: "progress_panel",
                  type: "panel",
                  title: "Daily Goals",
                  children: [
                    {
                      id: "steps_prog",
                      type: "progress",
                      label: "Steps",
                      value: 8432,
                      max: 10000,
                      unit: "steps",
                      tone: "primary",
                    },
                    {
                      id: "water_prog",
                      type: "progress",
                      label: "Water",
                      value: 6,
                      max: 8,
                      unit: "glasses",
                      tone: "warning",
                    },
                    {
                      id: "exercise_prog",
                      type: "progress",
                      label: "Exercise",
                      value: 35,
                      max: 60,
                      unit: "min",
                      tone: "success",
                    },
                    {
                      id: "cal_prog",
                      type: "progress",
                      label: "Calories Burned",
                      value: 420,
                      max: 500,
                      unit: "kcal",
                      tone: "primary",
                    },
                  ],
                },
              ],
            },
            secondary: {
              id: "right_col",
              type: "container",
              direction: "column",
              gap: "md",
              children: [
                {
                  id: "weight_input_card",
                  type: "card",
                  title: "Log Weight",
                  children: [
                    {
                      id: "weight_input",
                      type: "stepper",
                      label: "Weight",
                      value: 70,
                      unit: "kg",
                      min: 30,
                      max: 200,
                      step: 0.5,
                      binding: "app.inputs.weight",
                      semanticRole: "input",
                      interaction: { mode: "local" },
                    },
                  ],
                },
                {
                  id: "activity_card",
                  type: "card",
                  title: "Activity Level",
                  children: [
                    {
                      id: "activity_slider",
                      type: "slider",
                      label: "Activity Level",
                      value: 3,
                      min: 1,
                      max: 5,
                      step: 1,
                      binding: "app.inputs.activityLevel",
                      semanticRole: "input",
                      interaction: { mode: "local" },
                    },
                  ],
                },
                {
                  id: "timeline_panel",
                  type: "panel",
                  title: "Today's Timeline",
                  children: [
                    {
                      id: "health_timeline",
                      type: "timeline",
                      items: [
                        {
                          id: "t1",
                          title: "Morning Run",
                          description: "5km · 32min · Avg HR 145",
                          timestamp: "7:30 AM",
                          tone: "success",
                          icon: "🏃",
                        },
                        {
                          id: "t2",
                          title: "Breakfast",
                          description: "Oatmeal + banana · 450 kcal",
                          timestamp: "8:15 AM",
                          tone: "default",
                          icon: "🍳",
                        },
                        {
                          id: "t3",
                          title: "Gym Session",
                          description: "Upper body · 45min",
                          timestamp: "12:00 PM",
                          tone: "primary",
                          icon: "💪",
                        },
                        {
                          id: "t4",
                          title: "Lunch",
                          description: "Chicken salad · 620 kcal",
                          timestamp: "1:30 PM",
                          tone: "default",
                          icon: "🥗",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
          {
            id: "health_warning",
            type: "alert",
            tone: "warning",
            title: "Simulated Data",
            message:
              "This is a demo health tracker. Data is simulated. Not medical advice.",
            semanticRole: "warning",
          },
        ],
      },
    },
    diagnostics: {
      eventInterpretedAs: `User searched: "${query}"`,
      stateTransition: "launcher -> health_tracker",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

function buildCalculatorApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: appId,
        title: formatTitle(query),
        kind: "utility",
        description: `Generated calculator for: ${query}`,
      },
      memory: {
        app: { simulated: true, query },
        session: { currentTask: query, currentView: "calculator" },
      },
      ui: {
        id: "calc_screen",
        type: "screen",
        title: formatTitle(query),
        layoutMode: "single",
        children: [
          {
            id: "calc_header",
            type: "heading",
            level: 1,
            text: formatTitle(query),
            semanticRole: "display",
          },
          {
            id: "calc_panel",
            type: "panel",
            title: "Input Parameters",
            children: [
              {
                id: "input_a",
                type: "number_input",
                label: "Value A",
                value: 100,
                binding: "app.inputs.a",
                semanticRole: "input",
                interaction: { mode: "local" },
              },
              {
                id: "input_b",
                type: "number_input",
                label: "Value B",
                value: 50,
                binding: "app.inputs.b",
                semanticRole: "input",
                interaction: { mode: "local" },
              },
              {
                id: "op_select",
                type: "select",
                label: "Operation",
                value: "add",
                binding: "app.inputs.operation",
                options: [
                  { label: "Add (+)", value: "add" },
                  { label: "Subtract (-)", value: "subtract" },
                  { label: "Multiply (x)", value: "multiply" },
                  { label: "Divide (/)", value: "divide" },
                ],
                semanticRole: "input",
                interaction: { mode: "local" },
              },
              {
                id: "calc_btn",
                type: "button",
                label: "Calculate",
                intent: "calculate_result",
                variant: "primary",
                semanticRole: "analysis_action",
                interaction: {
                  mode: "ai_transition",
                  commitOn: ["click"],
                  includeLocalStateOnCommit: true,
                },
              },
            ],
          },
          {
            id: "result_metric",
            type: "metric",
            label: "Result",
            value: 150,
            confidence: "estimated",
            semanticRole: "simulation_result",
          },
          {
            id: "calc_warning",
            type: "alert",
            tone: "warning",
            title: "Simulated Calculator",
            message: "This is a demo calculator. Results are simulated.",
            semanticRole: "warning",
          },
          {
            id: "reset_btn",
            type: "button",
            label: "Reset",
            intent: "restart_runtime",
            variant: "secondary",
            semanticRole: "navigation",
            interaction: { mode: "ai_transition", commitOn: ["click"] },
          },
        ],
      },
    },
    diagnostics: {
      eventInterpretedAs: `User searched: "${query}"`,
      stateTransition: "launcher -> calculator",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

function buildNotesApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: appId,
        title: formatTitle(query),
        kind: "productivity_tool",
        description: `Generated notes app for: ${query}`,
      },
      memory: {
        app: { simulated: true, query },
        session: { currentTask: query, currentView: "notes" },
      },
      ui: {
        id: "notes_screen",
        type: "screen",
        title: formatTitle(query),
        layoutMode: "workspace",
        children: [
          {
            id: "notes_header",
            type: "region",
            region: "header",
            children: [
              {
                id: "notes_title",
                type: "heading",
                level: 1,
                text: formatTitle(query),
                semanticRole: "display",
              },
              {
                id: "new_note_btn",
                type: "button",
                label: "+ New Note",
                intent: "create_note",
                variant: "primary",
                semanticRole: "analysis_action",
                interaction: { mode: "ai_transition", commitOn: ["click"] },
              },
              {
                id: "reset_btn",
                type: "button",
                label: "Reset",
                intent: "restart_runtime",
                variant: "ghost",
                semanticRole: "navigation",
                interaction: { mode: "ai_transition", commitOn: ["click"] },
              },
            ],
          },
          {
            id: "note_title_input",
            type: "text_input",
            label: "Title",
            placeholder: "Note title...",
            binding: "app.inputs.noteTitle",
            semanticRole: "input",
            interaction: { mode: "local" },
          },
          {
            id: "note_content",
            type: "textarea",
            label: "Content",
            binding: "app.inputs.noteContent",
            interaction: { mode: "local" },
          },
          {
            id: "save_btn",
            type: "button",
            label: "Save Note",
            intent: "save_note",
            variant: "primary",
            semanticRole: "analysis_action",
            interaction: {
              mode: "ai_transition",
              commitOn: ["click"],
              includeLocalStateOnCommit: true,
            },
          },
          {
            id: "notes_warning",
            type: "alert",
            tone: "warning",
            title: "Simulated Notes",
            message: "This is a demo notes app. Notes are not persisted.",
            semanticRole: "warning",
          },
        ],
      },
    },
    diagnostics: {
      eventInterpretedAs: `User searched: "${query}"`,
      stateTransition: "launcher -> notes",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

function buildShowcaseApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: appId,
        title: "AUIR Component Showcase",
        kind: "utility",
        description: "Showcase of all available AUIR components",
      },
      memory: {
        app: { simulated: true },
        session: { currentTask: "Component showcase", currentView: "showcase" },
      },
      ui: {
        id: "showcase_screen",
        type: "screen",
        title: "AUIR Component Showcase",
        layoutMode: "dashboard",
        children: [
          {
            id: "show_header",
            type: "region",
            region: "header",
            children: [
              {
                id: "breadcrumb",
                type: "breadcrumb",
                items: [{ label: "Home" }, { label: "Showcase" }],
                separator: "›",
              },
              {
                id: "show_title",
                type: "heading",
                level: 1,
                text: "AUIR Component Showcase",
                semanticRole: "display",
              },
              {
                id: "show_subtitle",
                type: "text",
                text: "Demonstrating all 49 available UI components in one view",
                style: { tone: "muted" },
              },
              {
                id: "header_badges",
                type: "container",
                direction: "row",
                gap: "sm",
                children: [
                  {
                    id: "bdg_primary",
                    type: "badge",
                    text: "New",
                    variant: "primary",
                  },
                  {
                    id: "bdg_success",
                    type: "badge",
                    text: "49 Types",
                    variant: "success",
                  },
                  {
                    id: "bdg_info",
                    type: "badge",
                    text: "v0.3.1",
                    variant: "info",
                  },
                ],
              },
              {
                id: "reset_btn",
                type: "button",
                label: "Reset",
                intent: "restart_runtime",
                variant: "ghost",
                semanticRole: "navigation",
                interaction: { mode: "ai_transition", commitOn: ["click"] },
              },
            ],
          },
          {
            id: "tabs_main",
            type: "tabs",
            activeTab: "tab_kpi",
            tabs: [
              {
                id: "tab_kpi",
                label: "KPI & Metrics",
                children: [
                  {
                    id: "kpi_section",
                    type: "container",
                    direction: "column",
                    gap: "md",
                    children: [
                      {
                        id: "stat_group_row",
                        type: "stat_group",
                        columns: 4,
                        gap: "md",
                        items: [
                          {
                            id: "sg1",
                            label: "Revenue",
                            value: "$128K",
                            trend: "up",
                            trendValue: "+18.2%",
                          },
                          {
                            id: "sg2",
                            label: "Users",
                            value: "8,921",
                            trend: "up",
                            trendValue: "+5.7%",
                          },
                          {
                            id: "sg3",
                            label: "Churn",
                            value: "2.1%",
                            trend: "down",
                            trendValue: "-0.8%",
                          },
                          {
                            id: "sg4",
                            label: "NPS",
                            value: "72",
                            trend: "stable",
                          },
                        ],
                      },
                      {
                        id: "kpi_cards_row",
                        type: "grid",
                        columns: 3,
                        gap: "md",
                        children: [
                          {
                            id: "kpi_success",
                            type: "kpi_card",
                            title: "Customer Satisfaction",
                            value: 94,
                            unit: "%",
                            trend: "up",
                            trendValue: "+2.1%",
                            tone: "success",
                            description: "Based on 2,847 surveys",
                          },
                          {
                            id: "kpi_warning",
                            type: "kpi_card",
                            title: "Pending Orders",
                            value: 47,
                            trend: "up",
                            trendValue: "+12",
                            tone: "warning",
                            description: "12 require attention",
                          },
                          {
                            id: "kpi_danger",
                            type: "kpi_card",
                            title: "Failed Jobs",
                            value: 3,
                            trend: "down",
                            trendValue: "-2",
                            tone: "danger",
                            description: "All retried successfully",
                          },
                        ],
                      },
                      {
                        id: "stats_row",
                        type: "grid",
                        columns: 2,
                        gap: "md",
                        children: [
                          {
                            id: "stat_1",
                            type: "statistic",
                            title: "Avg Handle Time",
                            value: "4m 32s",
                            trend: "down",
                            trendValue: "-18s",
                            description: "Target: 5m",
                          },
                          {
                            id: "stat_2",
                            type: "statistic",
                            title: "First Response",
                            value: "1m 12s",
                            trend: "up",
                            trendValue: "+5s",
                            description: "Target: 2m",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: "tab_charts",
                label: "Charts & Viz",
                children: [
                  {
                    id: "charts_grid",
                    type: "grid",
                    columns: 2,
                    gap: "md",
                    children: [
                      {
                        id: "bar_chart",
                        type: "chart_bar",
                        title: "Revenue by Quarter",
                        xLabel: "Quarter",
                        yLabel: "Revenue (K)",
                        data: [
                          { label: "Q1", value: 45 },
                          { label: "Q2", value: 52 },
                          { label: "Q3", value: 48 },
                          { label: "Q4", value: 58 },
                        ],
                      },
                      {
                        id: "line_chart",
                        type: "chart_line",
                        title: "User Growth",
                        xLabel: "Month",
                        yLabel: "Users",
                        data: [
                          { x: "Jan", y: 1200 },
                          { x: "Feb", y: 1800 },
                          { x: "Mar", y: 2400 },
                          { x: "Apr", y: 3100 },
                          { x: "May", y: 4200 },
                          { x: "Jun", y: 5600 },
                        ],
                      },
                      {
                        id: "gauge_chart",
                        type: "container",
                        direction: "row",
                        gap: "md",
                        children: [
                          {
                            id: "gauge1",
                            type: "gauge",
                            title: "CPU Usage",
                            value: 67,
                            min: 0,
                            max: 100,
                            unit: "%",
                            size: "md",
                            thresholds: [
                              {
                                color: "success",
                                min: 0,
                                max: 50,
                                label: "Normal",
                              },
                              {
                                color: "warning",
                                min: 50,
                                max: 80,
                                label: "Elevated",
                              },
                              {
                                color: "danger",
                                min: 80,
                                max: 100,
                                label: "Critical",
                              },
                            ],
                          },
                          {
                            id: "gauge2",
                            type: "gauge",
                            title: "Memory",
                            value: 42,
                            min: 0,
                            max: 100,
                            unit: "%",
                            size: "md",
                            thresholds: [
                              { color: "success", min: 0, max: 60 },
                              { color: "warning", min: 60, max: 85 },
                              { color: "danger", min: 85, max: 100 },
                            ],
                          },
                        ],
                      },
                      {
                        id: "radar_demo",
                        type: "radar_chart",
                        title: "Team Skills",
                        axes: [
                          "Frontend",
                          "Backend",
                          "DevOps",
                          "Design",
                          "Data",
                          "Security",
                        ],
                        series: [
                          {
                            name: "Team A",
                            values: [85, 70, 60, 55, 45, 50],
                            color: "#3b82f6",
                          },
                          {
                            name: "Team B",
                            values: [60, 80, 75, 50, 65, 70],
                            color: "#10b981",
                          },
                        ],
                        maxValue: 100,
                      },
                    ],
                  },
                  {
                    id: "heatmap_demo",
                    type: "heatmap",
                    title: "Hourly Activity Heatmap",
                    xLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                    yLabels: ["9AM", "12PM", "3PM", "6PM", "9PM"],
                    data: [
                      [30, 45, 50, 55, 40, 15, 10],
                      [50, 65, 70, 75, 60, 25, 15],
                      [45, 60, 65, 60, 55, 20, 12],
                      [35, 50, 55, 50, 45, 18, 10],
                      [20, 30, 35, 30, 25, 30, 25],
                    ],
                    colorScale: "blue",
                    cellSize: "md",
                  },
                ],
              },
              {
                id: "tab_content",
                label: "Content & Structure",
                children: [
                  {
                    id: "content_container",
                    type: "container",
                    direction: "column",
                    gap: "md",
                    children: [
                      {
                        id: "timeline_demo",
                        type: "timeline",
                        items: [
                          {
                            id: "tml1",
                            title: "Project Kickoff",
                            description: "Team assembled, goals defined",
                            timestamp: "Week 1",
                            tone: "success",
                            icon: "🚀",
                          },
                          {
                            id: "tml2",
                            title: "Sprint 1 Complete",
                            description: "Core features implemented",
                            timestamp: "Week 3",
                            tone: "primary",
                            icon: "✓",
                          },
                          {
                            id: "tml3",
                            title: "Design Review",
                            description: "UX improvements requested",
                            timestamp: "Week 4",
                            tone: "warning",
                            icon: "⚠",
                          },
                        ],
                      },
                      {
                        id: "quote_demo",
                        type: "quote",
                        text: "Design is not just what it looks like and feels like. Design is how it works.",
                        author: "Steve Jobs",
                        tone: "primary",
                      },
                      {
                        id: "list_demo",
                        type: "list",
                        gap: "sm",
                        items: [
                          {
                            id: "li1",
                            text: "Architecture design review",
                            description: "Complete system design doc",
                            icon: "📐",
                            tone: "primary",
                          },
                          {
                            id: "li2",
                            text: "Frontend implementation",
                            description: "React components + state management",
                            icon: "🎨",
                            tone: "success",
                          },
                          {
                            id: "li3",
                            text: "API integration",
                            description: "Connect to backend services",
                            icon: "🔌",
                            tone: "default",
                          },
                          {
                            id: "li4",
                            text: "Testing & QA",
                            description: "Unit + integration + e2e",
                            icon: "🧪",
                            tone: "warning",
                          },
                        ],
                      },
                      {
                        id: "desc_list_demo",
                        type: "description_list",
                        layout: "horizontal",
                        gap: "md",
                        items: [
                          {
                            id: "dl1",
                            term: "Framework",
                            description: "Next.js 15 + React 19",
                          },
                          {
                            id: "dl2",
                            term: "Language",
                            description: "TypeScript 5.7",
                          },
                          {
                            id: "dl3",
                            term: "Styling",
                            description: "Tailwind CSS 4.1",
                          },
                          {
                            id: "dl4",
                            term: "AI Runtime",
                            description: "Vercel AI SDK v4",
                          },
                        ],
                      },
                      {
                        id: "code_demo",
                        type: "code_block",
                        language: "typescript",
                        code: '// AUIR Component Definition\nexport type KPICardNode = BaseNode & {\n  type: "kpi_card";\n  title: string;\n  value: string | number;\n  trend?: "up" | "down" | "stable";\n};',
                      },
                      {
                        id: "color_demo",
                        type: "color_swatch",
                        title: "Brand Palette",
                        colors: [
                          { value: "#3b82f6", label: "Primary Blue" },
                          { value: "#10b981", label: "Success Green" },
                          { value: "#f59e0b", label: "Warning Amber" },
                          { value: "#ef4444", label: "Danger Red" },
                          { value: "#8b5cf6", label: "Purple" },
                        ],
                        size: "sm",
                      },
                    ],
                  },
                ],
              },
              {
                id: "tab_nav",
                label: "Navigation & Feedback",
                children: [
                  {
                    id: "nav_container",
                    type: "container",
                    direction: "column",
                    gap: "md",
                    children: [
                      {
                        id: "steps_demo",
                        type: "steps",
                        current: 2,
                        direction: "horizontal",
                        items: [
                          {
                            id: "s1",
                            title: "Setup",
                            description: "Environment config",
                            status: "finish",
                          },
                          {
                            id: "s2",
                            title: "Develop",
                            description: "Build features",
                            status: "process",
                          },
                          {
                            id: "s3",
                            title: "Test",
                            description: "QA verification",
                            status: "wait",
                          },
                          {
                            id: "s4",
                            title: "Deploy",
                            description: "Release to prod",
                            status: "wait",
                          },
                        ],
                      },
                      {
                        id: "alerts_demo",
                        type: "container",
                        direction: "column",
                        gap: "sm",
                        children: [
                          {
                            id: "alert_info",
                            type: "alert",
                            tone: "info",
                            title: "Information",
                            message:
                              "System maintenance scheduled for Sunday 2AM UTC.",
                          },
                          {
                            id: "alert_success",
                            type: "alert",
                            tone: "success",
                            title: "Success",
                            message:
                              "Deployment v2.4.1 completed successfully.",
                          },
                          {
                            id: "alert_warning",
                            type: "alert",
                            tone: "warning",
                            title: "Warning",
                            message: "Disk usage approaching 80% threshold.",
                          },
                          {
                            id: "alert_danger",
                            type: "alert",
                            tone: "danger",
                            title: "Error",
                            message:
                              "Payment gateway timeout detected. Retrying...",
                          },
                        ],
                      },
                      {
                        id: "empty_demo",
                        type: "empty_state",
                        icon: "📭",
                        title: "No notifications yet",
                        description:
                          "When you receive alerts, updates, or messages, they will appear here.",
                        action: {
                          label: "Refresh",
                          intent: "refresh_notifications",
                        },
                      },
                      {
                        id: "carousel_demo",
                        type: "carousel",
                        title: "Featured Cards",
                        visibleItems: 3,
                        gap: "md",
                        children: [
                          {
                            id: "card1",
                            type: "card",
                            title: "Analytics",
                            subtitle: "Real-time dashboards",
                            image: "📊 Analytics",
                            children: [
                              {
                                id: "c1_text",
                                type: "text",
                                text: "Track KPIs and metrics in real time.",
                                style: { tone: "muted" },
                              },
                            ],
                            footer: [
                              {
                                id: "c1_btn",
                                type: "button",
                                label: "Open",
                                intent: "open_analytics",
                                variant: "primary",
                              },
                            ],
                          },
                          {
                            id: "card2",
                            type: "card",
                            title: "Documents",
                            subtitle: "Collaborative editing",
                            image: "📄 Documents",
                            children: [
                              {
                                id: "c2_text",
                                type: "text",
                                text: "Create and edit documents with your team.",
                                style: { tone: "muted" },
                              },
                            ],
                            footer: [
                              {
                                id: "c2_btn",
                                type: "button",
                                label: "Open",
                                intent: "open_docs",
                                variant: "primary",
                              },
                            ],
                          },
                          {
                            id: "card3",
                            type: "card",
                            title: "Settings",
                            subtitle: "System configuration",
                            image: "⚙️ Settings",
                            children: [
                              {
                                id: "c3_text",
                                type: "text",
                                text: "Manage system settings and preferences.",
                                style: { tone: "muted" },
                              },
                            ],
                            footer: [
                              {
                                id: "c3_btn",
                                type: "button",
                                label: "Open",
                                intent: "open_settings",
                                variant: "secondary",
                              },
                            ],
                          },
                          {
                            id: "card4",
                            type: "card",
                            title: "Security",
                            subtitle: "Access & permissions",
                            image: "🔒 Security",
                            children: [
                              {
                                id: "c4_text",
                                type: "text",
                                text: "Review security logs and manage access.",
                                style: { tone: "muted" },
                              },
                            ],
                            footer: [
                              {
                                id: "c4_btn",
                                type: "button",
                                label: "Open",
                                intent: "open_security",
                                variant: "ghost",
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "show_warning",
            type: "alert",
            tone: "info",
            title: "Component Showcase",
            message:
              "This page demonstrates all 49 available AUIR components. Try searching for specific app types to see them in real contexts.",
            semanticRole: "display",
          },
        ],
      },
    },
    diagnostics: {
      eventInterpretedAs: `User searched: "${query}"`,
      stateTransition: "launcher -> showcase",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

function buildProjectTrackerApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: appId,
        title: formatTitle(query),
        kind: "productivity_tool",
        description: `Generated project tracker for: ${query}`,
      },
      memory: {
        app: { simulated: true, query },
        session: { currentTask: query, currentView: "tracker" },
      },
      ui: {
        id: "project_screen",
        type: "screen",
        title: formatTitle(query),
        layoutMode: "workspace",
        children: [
          {
            id: "proj_header",
            type: "region",
            region: "header",
            children: [
              {
                id: "proj_breadcrumb",
                type: "breadcrumb",
                items: [{ label: "Projects" }, { label: formatTitle(query) }],
                separator: "/",
              },
              {
                id: "proj_title",
                type: "heading",
                level: 1,
                text: formatTitle(query),
                semanticRole: "display",
              },
              {
                id: "proj_desc",
                type: "text",
                text: "Track milestones, tasks, and team progress",
                style: { tone: "muted" },
              },
              {
                id: "header_actions",
                type: "container",
                direction: "row",
                gap: "sm",
                children: [
                  {
                    id: "btn_new",
                    type: "button",
                    label: "+ New Task",
                    intent: "create_task",
                    variant: "primary",
                    semanticRole: "analysis_action",
                    interaction: { mode: "ai_transition", commitOn: ["click"] },
                  },
                  {
                    id: "reset_btn",
                    type: "button",
                    label: "Reset",
                    intent: "restart_runtime",
                    variant: "ghost",
                    semanticRole: "navigation",
                    interaction: { mode: "ai_transition", commitOn: ["click"] },
                  },
                ],
              },
            ],
          },
          {
            id: "steps_progress",
            type: "steps",
            current: 3,
            direction: "horizontal",
            items: [
              {
                id: "phase1",
                title: "Planning",
                description: "Requirements & design",
                status: "finish",
              },
              {
                id: "phase2",
                title: "Development",
                description: "Core implementation",
                status: "finish",
              },
              {
                id: "phase3",
                title: "Testing",
                description: "QA & review",
                status: "process",
              },
              {
                id: "phase4",
                title: "Deployment",
                description: "Release & monitor",
                status: "wait",
              },
              {
                id: "phase5",
                title: "Maintenance",
                description: "Support & iterate",
                status: "wait",
              },
            ],
          },
          {
            id: "main_split",
            type: "split",
            orientation: "horizontal",
            ratio: "2:1",
            primary: {
              id: "main_col",
              type: "container",
              direction: "column",
              gap: "md",
              children: [
                {
                  id: "tasks_panel",
                  type: "panel",
                  title: "Current Sprint Tasks",
                  children: [
                    {
                      id: "task_table",
                      type: "table",
                      columns: ["#", "Task", "Assignee", "Status", "Priority"],
                      rows: [
                        [1, "API integration", "Alice", "In Progress", "High"],
                        [2, "Dashboard UI", "Bob", "Review", "High"],
                        [3, "Write tests", "Carol", "To Do", "Medium"],
                        [4, "Update docs", "Dave", "Done", "Low"],
                        [5, "Performance audit", "Alice", "To Do", "Medium"],
                      ],
                    },
                  ],
                },
                {
                  id: "progress_grid",
                  type: "grid",
                  columns: 2,
                  gap: "md",
                  children: [
                    {
                      id: "prog_overall",
                      type: "progress",
                      label: "Overall Progress",
                      value: 65,
                      max: 100,
                      unit: "%",
                      tone: "primary",
                    },
                    {
                      id: "prog_budget",
                      type: "progress",
                      label: "Budget Used",
                      value: 48,
                      max: 100,
                      unit: "%",
                      tone: "success",
                    },
                    {
                      id: "prog_sprint",
                      type: "progress",
                      label: "Sprint Burndown",
                      value: 72,
                      max: 100,
                      unit: "%",
                      tone: "warning",
                    },
                    {
                      id: "prog_risk",
                      type: "progress",
                      label: "Risk Level",
                      value: 25,
                      max: 100,
                      unit: "%",
                      tone: "success",
                    },
                  ],
                },
              ],
            },
            secondary: {
              id: "side_col",
              type: "container",
              direction: "column",
              gap: "md",
              children: [
                {
                  id: "kpi_velocity",
                  type: "kpi_card",
                  title: "Team Velocity",
                  value: 34,
                  unit: "pts/sprint",
                  trend: "up",
                  trendValue: "+5",
                  tone: "primary",
                  description: "3 sprints remaining",
                },
                {
                  id: "stat_bugs",
                  type: "statistic",
                  title: "Open Bugs",
                  value: 12,
                  trend: "down",
                  trendValue: "-3",
                },
                {
                  id: "stat_coverage",
                  type: "statistic",
                  title: "Test Coverage",
                  value: "87%",
                  trend: "up",
                  trendValue: "+4%",
                },
                {
                  id: "timeline_panel",
                  type: "panel",
                  title: "Recent Updates",
                  children: [
                    {
                      id: "proj_timeline",
                      type: "timeline",
                      items: [
                        {
                          id: "pt1",
                          title: "Sprint Review",
                          description: "Completed 8 of 10 stories",
                          timestamp: "Yesterday",
                          tone: "success",
                          icon: "✓",
                        },
                        {
                          id: "pt2",
                          title: "PR #142 Merged",
                          description: "Dashboard UI refactor",
                          timestamp: "2 days ago",
                          tone: "primary",
                          icon: "●",
                        },
                        {
                          id: "pt3",
                          title: "Bug #89 Found",
                          description: "Critical: memory leak in API",
                          timestamp: "3 days ago",
                          tone: "danger",
                          icon: "!",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
          {
            id: "accordion_details",
            type: "accordion",
            defaultOpenIndex: -1,
            items: [
              {
                id: "acc_risks",
                title: "Risk Register",
                children: [
                  {
                    id: "risk_list",
                    type: "list",
                    gap: "sm",
                    items: [
                      {
                        id: "r1",
                        text: "API provider deprecation",
                        description:
                          "Impact: High · Probability: Low · Mitigation: Migration plan ready",
                        icon: "🔴",
                        tone: "danger",
                      },
                      {
                        id: "r2",
                        text: "Team capacity reduction",
                        description:
                          "Impact: Medium · Probability: Medium · Mitigation: Cross-training",
                        icon: "🟡",
                        tone: "warning",
                      },
                      {
                        id: "r3",
                        text: "Scope creep on dashboard",
                        description:
                          "Impact: Low · Probability: High · Mitigation: Strict change control",
                        icon: "🟢",
                        tone: "success",
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "warning",
            type: "alert",
            tone: "warning",
            title: "Simulated Data",
            message: "This is a demo project tracker. Data is simulated.",
            semanticRole: "warning",
          },
        ],
      },
    },
    diagnostics: {
      eventInterpretedAs: `User searched: "${query}"`,
      stateTransition: "launcher -> project_tracker",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

function buildAnalyticsApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: appId,
        title: formatTitle(query),
        kind: "dashboard",
        description: `Generated analytics for: ${query}`,
      },
      memory: {
        app: { simulated: true, query },
        session: { currentTask: query, currentView: "analytics" },
      },
      ui: {
        id: "analytics_screen",
        type: "screen",
        title: formatTitle(query),
        layoutMode: "dashboard",
        children: [
          {
            id: "anal_header",
            type: "region",
            region: "header",
            children: [
              {
                id: "anal_breadcrumb",
                type: "breadcrumb",
                items: [{ label: "Analytics" }, { label: formatTitle(query) }],
                separator: "›",
              },
              {
                id: "anal_title",
                type: "heading",
                level: 1,
                text: formatTitle(query),
                semanticRole: "display",
              },
              {
                id: "anal_period",
                type: "container",
                direction: "row",
                gap: "sm",
                children: [
                  {
                    id: "tag_period",
                    type: "tag",
                    text: "Last 30 days",
                    variant: "info",
                    size: "sm",
                  },
                  {
                    id: "tag_update",
                    type: "badge",
                    text: "Updated 5 min ago",
                    variant: "default",
                    size: "sm",
                  },
                ],
              },
              {
                id: "reset_btn",
                type: "button",
                label: "Reset",
                intent: "restart_runtime",
                variant: "ghost",
                semanticRole: "navigation",
                interaction: { mode: "ai_transition", commitOn: ["click"] },
              },
            ],
          },
          {
            id: "kpi_header",
            type: "stat_group",
            columns: 4,
            gap: "md",
            items: [
              {
                id: "ak1",
                label: "Total Visitors",
                value: "142K",
                trend: "up",
                trendValue: "+23.1%",
              },
              {
                id: "ak2",
                label: "Bounce Rate",
                value: "32.4%",
                trend: "down",
                trendValue: "-5.2%",
              },
              {
                id: "ak3",
                label: "Avg Session",
                value: "4m 12s",
                trend: "up",
                trendValue: "+32s",
              },
              {
                id: "ak4",
                label: "Goal Conv.",
                value: "8.7%",
                trend: "up",
                trendValue: "+1.4%",
              },
            ],
          },
          {
            id: "body_grid",
            type: "grid",
            columns: 2,
            gap: "md",
            children: [
              {
                id: "traffic_chart",
                type: "chart_line",
                title: "Traffic Sources",
                xLabel: "Date",
                yLabel: "Visitors",
                data: [
                  { x: "Jun 1", y: 4200 },
                  { x: "Jun 3", y: 5100 },
                  { x: "Jun 5", y: 4800 },
                  { x: "Jun 7", y: 5600 },
                  { x: "Jun 9", y: 5300 },
                  { x: "Jun 11", y: 6200 },
                  { x: "Jun 13", y: 5800 },
                ],
              },
              {
                id: "source_chart",
                type: "chart_bar",
                title: "By Source",
                xLabel: "Source",
                yLabel: "Visitors",
                data: [
                  { label: "Organic", value: 62000 },
                  { label: "Direct", value: 38000 },
                  { label: "Social", value: 24000 },
                  { label: "Referral", value: 12000 },
                  { label: "Email", value: 6000 },
                ],
              },
              {
                id: "funnel_card",
                type: "card",
                title: "Conversion Funnel",
                subtitle: "Visitor → Signup → Active → Paid",
                children: [
                  {
                    id: "funnel_prog1",
                    type: "progress",
                    label: "Visited",
                    value: 142000,
                    max: 142000,
                    unit: "",
                    tone: "primary",
                  },
                  {
                    id: "funnel_prog2",
                    type: "progress",
                    label: "Signed Up",
                    value: 28500,
                    max: 142000,
                    unit: "(20.1%)",
                    tone: "primary",
                  },
                  {
                    id: "funnel_prog3",
                    type: "progress",
                    label: "Activated",
                    value: 12400,
                    max: 142000,
                    unit: "(8.7%)",
                    tone: "warning",
                  },
                  {
                    id: "funnel_prog4",
                    type: "progress",
                    label: "Paid",
                    value: 4200,
                    max: 142000,
                    unit: "(3.0%)",
                    tone: "success",
                  },
                ],
              },
              {
                id: "insights_card",
                type: "card",
                title: "Key Insights",
                children: [
                  {
                    id: "insights_list",
                    type: "list",
                    gap: "sm",
                    items: [
                      {
                        id: "ins1",
                        text: "Organic traffic grew 23% MoM",
                        description: "Driven by SEO improvements",
                        icon: "📈",
                        tone: "success",
                      },
                      {
                        id: "ins2",
                        text: "Mobile bounce rate improved",
                        description: "Down from 45% to 32%",
                        icon: "📱",
                        tone: "success",
                      },
                      {
                        id: "ins3",
                        text: "Checkout abandonment increased",
                        description: "Up 3.2% - investigate payment flow",
                        icon: "🛒",
                        tone: "warning",
                      },
                      {
                        id: "ins4",
                        text: "Email CTR below benchmark",
                        description: "2.1% vs 3.5% industry avg",
                        icon: "📧",
                        tone: "danger",
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "heatmap_row",
            type: "heatmap",
            title: "User Activity by Hour & Day",
            xLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            yLabels: ["0h", "4h", "8h", "12h", "16h", "20h"],
            data: [
              [5, 3, 2, 2, 1, 8, 10],
              [3, 2, 1, 1, 2, 15, 20],
              [25, 30, 35, 28, 22, 25, 18],
              [45, 50, 55, 48, 42, 35, 25],
              [60, 65, 70, 62, 58, 40, 30],
              [35, 40, 45, 38, 32, 25, 20],
            ],
            colorScale: "green",
            cellSize: "md",
          },
          {
            id: "anal_warning",
            type: "alert",
            tone: "warning",
            title: "Simulated Data",
            message:
              "This is a demo analytics dashboard. All data is simulated.",
            semanticRole: "warning",
          },
        ],
      },
    },
    diagnostics: {
      eventInterpretedAs: `User searched: "${query}"`,
      stateTransition: "launcher -> analytics",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

function buildGenericUtilityApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: appId,
        title: formatTitle(query),
        kind: "utility",
        description: `Generated app for: ${query}`,
      },
      memory: {
        app: { simulated: true, query },
        session: { currentTask: query, currentView: "main" },
      },
      ui: {
        id: "generic_screen",
        type: "screen",
        title: formatTitle(query),
        layoutMode: "workspace",
        children: [
          {
            id: "generic_header",
            type: "region",
            region: "header",
            children: [
              {
                id: "generic_title",
                type: "heading",
                level: 1,
                text: formatTitle(query),
                semanticRole: "display",
              },
              {
                id: "generic_desc",
                type: "text",
                text: `AI-generated app for: "${query}". Use the controls below to interact.`,
                style: { tone: "muted" },
              },
              {
                id: "generic_tags",
                type: "container",
                direction: "row",
                gap: "sm",
                children: [
                  {
                    id: "tag_sim",
                    type: "badge",
                    text: "Simulated",
                    variant: "warning",
                    size: "sm",
                  },
                  {
                    id: "tag_utility",
                    type: "tag",
                    text: "Utility",
                    variant: "default",
                    size: "sm",
                  },
                ],
              },
              {
                id: "reset_btn",
                type: "button",
                label: "Reset",
                intent: "restart_runtime",
                variant: "ghost",
                semanticRole: "navigation",
                interaction: { mode: "ai_transition", commitOn: ["click"] },
              },
            ],
          },
          {
            id: "generic_split",
            type: "split",
            orientation: "horizontal",
            ratio: "2:1",
            primary: {
              id: "gen_main",
              type: "container",
              direction: "column",
              gap: "md",
              children: [
                {
                  id: "gen_input_panel",
                  type: "panel",
                  title: "Input Parameters",
                  children: [
                    {
                      id: "generic_input",
                      type: "text_input",
                      label: "Query / Input",
                      placeholder: "Enter a value...",
                      binding: "app.inputs.value",
                      semanticRole: "input",
                      interaction: { mode: "local" },
                    },
                    {
                      id: "gen_select",
                      type: "select",
                      label: "Mode",
                      value: "standard",
                      binding: "app.inputs.mode",
                      options: [
                        { label: "Standard", value: "standard" },
                        { label: "Advanced", value: "advanced" },
                        { label: "Expert", value: "expert" },
                      ],
                      semanticRole: "input",
                      interaction: { mode: "local" },
                    },
                    {
                      id: "gen_check",
                      type: "checkbox",
                      label: "Include details",
                      checked: true,
                      binding: "app.inputs.includeDetails",
                      semanticRole: "input",
                      interaction: { mode: "local" },
                    },
                    {
                      id: "generic_btn",
                      type: "button",
                      label: "Process",
                      intent: "process_input",
                      variant: "primary",
                      semanticRole: "analysis_action",
                      interaction: {
                        mode: "ai_transition",
                        commitOn: ["click"],
                        includeLocalStateOnCommit: true,
                      },
                    },
                  ],
                },
                {
                  id: "gen_results",
                  type: "container",
                  direction: "column",
                  gap: "md",
                  children: [
                    {
                      id: "gen_table",
                      type: "table",
                      columns: ["Field", "Value", "Status"],
                      rows: [
                        ["Input", "--", "Pending"],
                        ["Mode", "Standard", "Ready"],
                        ["Timestamp", new Date().toISOString(), "Active"],
                      ],
                    },
                    {
                      id: "gen_prog",
                      type: "progress",
                      label: "Processing",
                      value: 0,
                      max: 100,
                      unit: "%",
                      tone: "primary",
                    },
                  ],
                },
              ],
            },
            secondary: {
              id: "gen_side",
              type: "container",
              direction: "column",
              gap: "md",
              children: [
                {
                  id: "gen_quote",
                  type: "quote",
                  text: "Simplicity is the ultimate sophistication.",
                  author: "Leonardo da Vinci",
                  tone: "muted",
                },
                {
                  id: "gen_stat",
                  type: "statistic",
                  title: "Response Time",
                  value: "N/A",
                  description: "Run a query to see results",
                },
                {
                  id: "gen_empty",
                  type: "empty_state",
                  icon: "🔍",
                  title: "No results yet",
                  description:
                    "Enter parameters and click Process to generate results.",
                },
              ],
            },
          },
          {
            id: "generic_warning",
            type: "alert",
            tone: "warning",
            title: "Simulated App",
            message: `This "${query}" app runs on the mock runtime. Data is simulated.`,
            semanticRole: "warning",
          },
        ],
      },
    },
    diagnostics: {
      eventInterpretedAs: `User searched: "${query}"`,
      stateTransition: "launcher -> generic_app",
      simulatedData: true,
      modelUsed: "mock",
    },
  };
}

/** Format query into a clean title (remove "create a", "build a", "make a" prefixes) */
function formatTitle(query: string): string {
  return (
    query
      .replace(
        /^(create|build|make|generate|design|construct) (a|an|the) /i,
        "",
      )
      .replace(/^(a|an|the) /i, "")
      .replace(/^[:\s]+/, "")
      .trim()
      // Capitalize first letter of each word
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// -----------------------------------------------------------
// UI Tree helpers
// -----------------------------------------------------------

function updateMetricInTree(
  node: unknown,
  targetId: string,
  newValue: string | number,
): boolean {
  if (!node || typeof node !== "object") return false;
  const obj = node as Record<string, unknown>;

  if (obj.id === targetId && obj.type === "metric") {
    obj.value = newValue;
    return true;
  }

  if ("children" in obj && Array.isArray(obj.children)) {
    for (const child of obj.children) {
      if (updateMetricInTree(child, targetId, newValue)) return true;
    }
  }
  if ("primary" in obj && updateMetricInTree(obj.primary, targetId, newValue))
    return true;
  if (
    "secondary" in obj &&
    updateMetricInTree(obj.secondary, targetId, newValue)
  )
    return true;
  if ("tabs" in obj && Array.isArray(obj.tabs)) {
    for (const tab of obj.tabs) {
      if (
        tab &&
        typeof tab === "object" &&
        "children" in tab &&
        Array.isArray(tab.children)
      ) {
        for (const child of tab.children) {
          if (updateMetricInTree(child, targetId, newValue)) return true;
        }
      }
    }
  }
  return false;
}

function updateBindingInTree(
  node: unknown,
  binding: string,
  value: unknown,
): boolean {
  if (!node || typeof node !== "object") return false;
  const obj = node as Record<string, unknown>;

  if ("binding" in obj && obj.binding === binding) {
    if ("value" in obj) obj.value = value;
    if ("checked" in obj) obj.checked = value;
    return true;
  }

  if ("children" in obj && Array.isArray(obj.children)) {
    for (const child of obj.children) {
      if (updateBindingInTree(child, binding, value)) return true;
    }
  }
  if ("primary" in obj && updateBindingInTree(obj.primary, binding, value))
    return true;
  if ("secondary" in obj && updateBindingInTree(obj.secondary, binding, value))
    return true;
  if ("tabs" in obj && Array.isArray(obj.tabs)) {
    for (const tab of obj.tabs) {
      if (
        tab &&
        typeof tab === "object" &&
        "children" in tab &&
        Array.isArray(tab.children)
      ) {
        for (const child of tab.children) {
          if (updateBindingInTree(child, binding, value)) return true;
        }
      }
    }
  }
  return false;
}

function replaceNodeInTree(
  node: unknown,
  targetId: string,
  replacement: unknown,
): boolean {
  if (!node || typeof node !== "object") return false;
  const obj = node as Record<string, unknown>;

  if ("children" in obj && Array.isArray(obj.children)) {
    for (let i = 0; i < obj.children.length; i++) {
      const child = obj.children[i] as Record<string, unknown>;
      if (child && typeof child === "object" && child.id === targetId) {
        obj.children[i] = replacement;
        return true;
      }
      if (replaceNodeInTree(child, targetId, replacement)) return true;
    }
  }
  if ("primary" in obj && replaceNodeInTree(obj.primary, targetId, replacement))
    return true;
  if (
    "secondary" in obj &&
    replaceNodeInTree(obj.secondary, targetId, replacement)
  )
    return true;
  return false;
}
