// ============================================================
// Mock AI Runtime — 无需 API Key 的模拟 Runtime
// ============================================================

import { exampleRocketCycleResponse } from "@/auir/examples";
import { createLauncherState } from "@/auir/fallback";
import type { AUIRRequest, AUIRResponse, AUIRState } from "@/auir/types";
import { executeTool } from "./tools";

/** Mock AI Runtime：根据事件类型生成演示响应 */
export async function mockGenerateNextAUIRState(
  request: AUIRRequest
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
        response.diagnostics.stateTransition = "launcher -> rocket_engine_cycle_analyzer";
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

    if (intent === "calculate_engine_performance" || clickId === "calc_button") {
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
  session: AUIRRequest["session"]
): AUIRResponse {
  const base = previous ?? exampleRocketCycleResponse().next;

  // Read local values (user's edits)
  const Pc = Number(localValues["app.inputs.chamberPressureMPa"] ?? 12);
  const MR = Number(localValues["app.inputs.mixtureRatio"] ?? 5.8);
  const eps = Number(localValues["app.inputs.expansionRatio"] ?? 80);
  const cycleType = String(localValues["app.inputs.cycleType"] ?? "staged_combustion");

  // Estimate using safeCalculator-style logic
  const toolResult = executeTool("estimateRocketCycle", {
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
    inputs: { chamberPressureMPa: Pc, mixtureRatio: MR, expansionRatio: eps, cycleType },
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
  updateMetricInTree(nextState.ui, "mass_flow_metric", estimates.massFlow_kgs ?? 245);
  updateMetricInTree(nextState.ui, "thrust_metric", estimates.thrust_kN ?? 1100);
  updateMetricInTree(nextState.ui, "exit_vel_metric", estimates.exitVelocity_ms ?? 4430);

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
  localValues: Record<string, unknown>
): AUIRResponse {
  const base = previous ?? exampleRocketCycleResponse().next;

  const Pc = Number(localValues["app.inputs.chamberPressureMPa"] ?? 12);
  const MR = Number(localValues["app.inputs.mixtureRatio"] ?? 5.8);
  const eps = Number(localValues["app.inputs.expansionRatio"] ?? 80);

  // Generate comparison data for 3 cycles
  const cycles = ["gas_generator", "expander", "staged_combustion"];
  const labels = ["Gas Generator", "Expander", "Staged Combustion"];
  const results = cycles.map((cycle) => {
    const r = executeTool("estimateRocketCycle", {
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
        columns: ["Cycle", "Isp (s)", "Mass Flow (kg/s)", "Thrust (kN)", "Exit Velocity (m/s)"],
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
  if (containsAny(lower, ["health", "fitness", "workout", "健康", "健身", "运动", "medical", "医疗"])) {
    return buildHealthTrackerApp(appId, query);
  }
  if (containsAny(lower, ["task", "todo", "kanban", "checklist", "任务", "待办", "清单"])) {
    return buildTaskManagerApp(appId, query);
  }
  if (containsAny(lower, ["code", "editor", "syntax", "programming", "ide", "代码", "编辑器", "编程"])) {
    return buildCodeEditorApp(appId, query);
  }
  if (containsAny(lower, ["calculator", "converter", "计算器", "转换"])) {
    return buildCalculatorApp(appId, query);
  }
  if (containsAny(lower, ["data", "table", "csv", "spreadsheet", "excel", "数据", "表格"])) {
    return buildDataTableApp(appId, query);
  }
  if (containsAny(lower, ["note", "text", "document", "writer", "笔记", "文档", "写作"])) {
    return buildNotesApp(appId, query);
  }
  if (containsAny(lower, ["dashboard", "analytics", "metric", "chart", "report", "统计", "报表", "图表", "监控"])) {
    return buildDashboardApp(appId, query);
  }

  // Default: engineering/utility tool
  return buildGenericUtilityApp(appId, query);
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some(k => text.includes(k));
}

// -----------------------------------------------------------
// App Templates
// -----------------------------------------------------------

function buildDashboardApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR", version: "0.3",
    next: {
      app: { id: appId, title: formatTitle(query), kind: "dashboard", description: `Generated dashboard for: ${query}` },
      memory: { app: { simulated: true, query }, session: { currentTask: query, currentView: "main" } },
      ui: {
        id: "dashboard_screen", type: "screen", title: formatTitle(query), layoutMode: "dashboard",
        children: [
          { id: "header", type: "region", region: "header", children: [
            { id: "title", type: "heading", level: 1, text: formatTitle(query), semanticRole: "display" },
            { id: "reset_btn", type: "button", label: "Reset", intent: "restart_runtime", variant: "ghost", semanticRole: "navigation", interaction: { mode: "ai_transition", commitOn: ["click"] } },
          ]},
          { id: "main_grid", type: "grid", columns: 3, gap: "md", children: [
            { id: "metric1", type: "metric", label: "Total Revenue", value: 84720, unit: "USD", confidence: "simulated", semanticRole: "simulation_result" },
            { id: "metric2", type: "metric", label: "Active Users", value: 12453, confidence: "simulated", semanticRole: "simulation_result" },
            { id: "metric3", type: "metric", label: "Conversion Rate", value: 3.42, unit: "%", confidence: "estimated", semanticRole: "simulation_result" },
            { id: "metric4", type: "metric", label: "Avg Response", value: 234, unit: "ms", confidence: "simulated", semanticRole: "simulation_result" },
            { id: "metric5", type: "metric", label: "Satisfaction", value: 94, unit: "%", confidence: "simulated", semanticRole: "simulation_result" },
            { id: "metric6", type: "metric", label: "Uptime", value: 99.97, unit: "%", confidence: "estimated", semanticRole: "simulation_result" },
          ]},
          { id: "chart_section", type: "panel", title: "Performance Trends", children: [
            { id: "revenue_chart", type: "chart_line", title: "Monthly Revenue", xLabel: "Month", yLabel: "Revenue (USD)", data: [
              { x: "Jan", y: 8200 }, { x: "Feb", y: 9100 }, { x: "Mar", y: 8500 }, { x: "Apr", y: 10200 }, { x: "May", y: 9700 }, { x: "Jun", y: 11200 },
            ]},
          ]},
          { id: "warning", type: "alert", tone: "warning", title: "Simulated Data", message: "This is a demo dashboard. All values are simulated.", semanticRole: "warning" },
          { id: "back_btn", type: "button", label: "Reset", intent: "restart_runtime", variant: "secondary", semanticRole: "navigation", interaction: { mode: "ai_transition", commitOn: ["click"] } },
        ],
      },
    },
    diagnostics: { eventInterpretedAs: `User searched: "${query}"`, stateTransition: "launcher -> dashboard", simulatedData: true, modelUsed: "mock" },
  };
}

function buildTaskManagerApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR", version: "0.3",
    next: {
      app: { id: appId, title: formatTitle(query), kind: "productivity_tool", description: `Generated task manager for: ${query}` },
      memory: { app: { simulated: true, query, tasks: [
        { id: "t1", title: "Design system architecture", status: "done", priority: "high" },
        { id: "t2", title: "Implement core modules", status: "in_progress", priority: "high" },
        { id: "t3", title: "Write unit tests", status: "pending", priority: "medium" },
        { id: "t4", title: "Update documentation", status: "pending", priority: "low" },
        { id: "t5", title: "Code review feedback", status: "in_progress", priority: "medium" },
      ]}, session: { currentTask: query, currentView: "board" } },
      ui: {
        id: "task_screen", type: "screen", title: formatTitle(query), layoutMode: "workspace",
        children: [
          { id: "task_header", type: "region", region: "header", children: [
            { id: "task_title", type: "heading", level: 1, text: formatTitle(query), semanticRole: "display" },
            { id: "add_task_btn", type: "button", label: "+ New Task", intent: "create_task", variant: "primary", semanticRole: "analysis_action", interaction: { mode: "ai_transition", commitOn: ["click"] } },
            { id: "reset_btn", type: "button", label: "Reset", intent: "restart_runtime", variant: "ghost", semanticRole: "navigation", interaction: { mode: "ai_transition", commitOn: ["click"] } },
          ]},
          { id: "task_table", type: "table", columns: ["#", "Task", "Status", "Priority"], rows: [
            [1, "Design system architecture", "Done", "High"],
            [2, "Implement core modules", "In Progress", "High"],
            [3, "Write unit tests", "Pending", "Medium"],
            [4, "Update documentation", "Pending", "Low"],
            [5, "Code review feedback", "In Progress", "Medium"],
          ]},
          { id: "task_input_section", type: "panel", title: "Quick Add", children: [
            { id: "new_task_input", type: "text_input", label: "Task name", placeholder: "Enter a new task...", binding: "app.inputs.newTask", semanticRole: "input", interaction: { mode: "local" } },
            { id: "priority_select", type: "select", label: "Priority", value: "medium", binding: "app.inputs.taskPriority", options: [
              { label: "High", value: "high" }, { label: "Medium", value: "medium" }, { label: "Low", value: "low" },
            ], semanticRole: "input", interaction: { mode: "local" } },
            { id: "submit_task_btn", type: "button", label: "Add Task", intent: "add_task", variant: "primary", semanticRole: "analysis_action", interaction: { mode: "ai_transition", commitOn: ["click"], includeLocalStateOnCommit: true } },
          ]},
          { id: "task_warning", type: "alert", tone: "warning", title: "Simulated Data", message: "This is a demo task manager. Tasks are simulated.", semanticRole: "warning" },
        ],
      },
    },
    diagnostics: { eventInterpretedAs: `User searched: "${query}"`, stateTransition: "launcher -> task_manager", simulatedData: true, modelUsed: "mock" },
  };
}

function buildCodeEditorApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR", version: "0.3",
    next: {
      app: { id: appId, title: formatTitle(query), kind: "utility", description: `Generated code editor for: ${query}` },
      memory: { app: { simulated: true, query }, session: { currentTask: query, currentView: "editor" } },
      ui: {
        id: "editor_screen", type: "screen", title: formatTitle(query), layoutMode: "workspace",
        children: [
          { id: "editor_header", type: "region", region: "header", children: [
            { id: "editor_title", type: "heading", level: 1, text: formatTitle(query), semanticRole: "display" },
            { id: "run_btn", type: "button", label: "Run", intent: "run_code", variant: "primary", semanticRole: "analysis_action", interaction: { mode: "ai_transition", commitOn: ["click"], includeLocalStateOnCommit: true } },
            { id: "reset_btn", type: "button", label: "Reset", intent: "restart_runtime", variant: "ghost", semanticRole: "navigation", interaction: { mode: "ai_transition", commitOn: ["click"] } },
          ]},
          { id: "lang_select", type: "select", label: "Language", value: "typescript", binding: "app.inputs.language", options: [
            { label: "TypeScript", value: "typescript" }, { label: "Python", value: "python" }, { label: "JavaScript", value: "javascript" }, { label: "Rust", value: "rust" },
          ], semanticRole: "input", interaction: { mode: "local" } },
          { id: "code_textarea", type: "textarea", label: "Code", binding: "app.inputs.code", interaction: { mode: "local" } },
          { id: "code_display", type: "code_block", language: "typescript", code: 'function fibonacci(n: number): number {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nconsole.log(fibonacci(10)); // 55' },
          { id: "editor_warning", type: "alert", tone: "warning", title: "Simulated Editor", message: "This is a demo code viewer. Code is not executed.", semanticRole: "warning" },
        ],
      },
    },
    diagnostics: { eventInterpretedAs: `User searched: "${query}"`, stateTransition: "launcher -> code_editor", simulatedData: true, modelUsed: "mock" },
  };
}

function buildDataTableApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR", version: "0.3",
    next: {
      app: { id: appId, title: formatTitle(query), kind: "utility", description: `Generated data table for: ${query}` },
      memory: { app: { simulated: true, query }, session: { currentTask: query, currentView: "table" } },
      ui: {
        id: "datatable_screen", type: "screen", title: formatTitle(query), layoutMode: "workspace",
        children: [
          { id: "dt_header", type: "region", region: "header", children: [
            { id: "dt_title", type: "heading", level: 1, text: formatTitle(query), semanticRole: "display" },
            { id: "filter_input", type: "text_input", label: "Filter", placeholder: "Search rows...", binding: "app.inputs.filter", semanticRole: "input", interaction: { mode: "local" } },
            { id: "export_btn", type: "button", label: "Export CSV", intent: "export_csv", variant: "secondary", semanticRole: "analysis_action", interaction: { mode: "ai_transition", commitOn: ["click"] } },
            { id: "reset_btn", type: "button", label: "Reset", intent: "restart_runtime", variant: "ghost", semanticRole: "navigation", interaction: { mode: "ai_transition", commitOn: ["click"] } },
          ]},
          { id: "data_table", type: "table", columns: ["ID", "Name", "Category", "Value", "Status"], rows: [
            [1, "Product A", "Electronics", "$1,200", "Active"],
            [2, "Product B", "Clothing", "$450", "Active"],
            [3, "Product C", "Food", "$89", "Inactive"],
            [4, "Product D", "Electronics", "$2,100", "Active"],
            [5, "Product E", "Books", "$24", "Active"],
            [6, "Product F", "Clothing", "$670", "Active"],
            [7, "Product G", "Electronics", "$590", "Inactive"],
            [8, "Product H", "Food", "$145", "Active"],
          ]},
          { id: "dt_stats", type: "grid", columns: 3, children: [
            { id: "total_rows", type: "metric", label: "Total Rows", value: 8, confidence: "simulated" },
            { id: "active_count", type: "metric", label: "Active", value: 6, confidence: "simulated" },
            { id: "total_value", type: "metric", label: "Total Value", value: 5268, unit: "USD", confidence: "simulated" },
          ]},
          { id: "dt_warning", type: "alert", tone: "warning", title: "Simulated Data", message: "This is a demo data table. Data is simulated.", semanticRole: "warning" },
        ],
      },
    },
    diagnostics: { eventInterpretedAs: `User searched: "${query}"`, stateTransition: "launcher -> data_table", simulatedData: true, modelUsed: "mock" },
  };
}

function buildHealthTrackerApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR", version: "0.3",
    next: {
      app: { id: appId, title: formatTitle(query), kind: "utility", description: `Generated health tracker for: ${query}` },
      memory: { app: { simulated: true, query }, session: { currentTask: query, currentView: "tracker" } },
      ui: {
        id: "health_screen", type: "screen", title: formatTitle(query), layoutMode: "dashboard",
        children: [
          { id: "health_header", type: "region", region: "header", children: [
            { id: "health_title", type: "heading", level: 1, text: formatTitle(query), semanticRole: "display" },
            { id: "log_btn", type: "button", label: "Log Entry", intent: "log_health", variant: "primary", semanticRole: "analysis_action", interaction: { mode: "ai_transition", commitOn: ["click"], includeLocalStateOnCommit: true } },
            { id: "reset_btn", type: "button", label: "Reset", intent: "restart_runtime", variant: "ghost", semanticRole: "navigation", interaction: { mode: "ai_transition", commitOn: ["click"] } },
          ]},
          { id: "health_metrics", type: "grid", columns: 4, children: [
            { id: "hr_metric", type: "metric", label: "Heart Rate", value: 72, unit: "bpm", confidence: "simulated", semanticRole: "simulation_result" },
            { id: "steps_metric", type: "metric", label: "Steps", value: 8432, confidence: "simulated", semanticRole: "simulation_result" },
            { id: "sleep_metric", type: "metric", label: "Sleep", value: 7.5, unit: "hrs", confidence: "estimated", semanticRole: "simulation_result" },
            { id: "cal_metric", type: "metric", label: "Calories", value: 2180, unit: "kcal", confidence: "simulated", semanticRole: "simulation_result" },
          ]},
          { id: "weight_input", type: "stepper", label: "Weight", value: 70, unit: "kg", min: 30, max: 200, step: 0.5, binding: "app.inputs.weight", semanticRole: "input", interaction: { mode: "local" } },
          { id: "activity_slider", type: "slider", label: "Activity Level", value: 3, min: 1, max: 5, step: 1, binding: "app.inputs.activityLevel", semanticRole: "input", interaction: { mode: "local" } },
          { id: "weekly_chart", type: "chart_line", title: "Weekly Steps", xLabel: "Day", yLabel: "Steps", data: [
            { x: "Mon", y: 9200 }, { x: "Tue", y: 7800 }, { x: "Wed", y: 10500 }, { x: "Thu", y: 6400 }, { x: "Fri", y: 8900 }, { x: "Sat", y: 11200 }, { x: "Sun", y: 7200 },
          ]},
          { id: "health_warning", type: "alert", tone: "warning", title: "Simulated Data", message: "This is a demo health tracker. Data is simulated. Not medical advice.", semanticRole: "warning" },
        ],
      },
    },
    diagnostics: { eventInterpretedAs: `User searched: "${query}"`, stateTransition: "launcher -> health_tracker", simulatedData: true, modelUsed: "mock" },
  };
}

function buildCalculatorApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR", version: "0.3",
    next: {
      app: { id: appId, title: formatTitle(query), kind: "utility", description: `Generated calculator for: ${query}` },
      memory: { app: { simulated: true, query }, session: { currentTask: query, currentView: "calculator" } },
      ui: {
        id: "calc_screen", type: "screen", title: formatTitle(query), layoutMode: "single",
        children: [
          { id: "calc_header", type: "heading", level: 1, text: formatTitle(query), semanticRole: "display" },
          { id: "calc_panel", type: "panel", title: "Input Parameters", children: [
            { id: "input_a", type: "number_input", label: "Value A", value: 100, binding: "app.inputs.a", semanticRole: "input", interaction: { mode: "local" } },
            { id: "input_b", type: "number_input", label: "Value B", value: 50, binding: "app.inputs.b", semanticRole: "input", interaction: { mode: "local" } },
            { id: "op_select", type: "select", label: "Operation", value: "add", binding: "app.inputs.operation", options: [
              { label: "Add (+)", value: "add" }, { label: "Subtract (-)", value: "subtract" }, { label: "Multiply (x)", value: "multiply" }, { label: "Divide (/)", value: "divide" },
            ], semanticRole: "input", interaction: { mode: "local" } },
            { id: "calc_btn", type: "button", label: "Calculate", intent: "calculate_result", variant: "primary", semanticRole: "analysis_action", interaction: { mode: "ai_transition", commitOn: ["click"], includeLocalStateOnCommit: true } },
          ]},
          { id: "result_metric", type: "metric", label: "Result", value: 150, confidence: "estimated", semanticRole: "simulation_result" },
          { id: "calc_warning", type: "alert", tone: "warning", title: "Simulated Calculator", message: "This is a demo calculator. Results are simulated.", semanticRole: "warning" },
          { id: "reset_btn", type: "button", label: "Reset", intent: "restart_runtime", variant: "secondary", semanticRole: "navigation", interaction: { mode: "ai_transition", commitOn: ["click"] } },
        ],
      },
    },
    diagnostics: { eventInterpretedAs: `User searched: "${query}"`, stateTransition: "launcher -> calculator", simulatedData: true, modelUsed: "mock" },
  };
}

function buildNotesApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR", version: "0.3",
    next: {
      app: { id: appId, title: formatTitle(query), kind: "productivity_tool", description: `Generated notes app for: ${query}` },
      memory: { app: { simulated: true, query }, session: { currentTask: query, currentView: "notes" } },
      ui: {
        id: "notes_screen", type: "screen", title: formatTitle(query), layoutMode: "workspace",
        children: [
          { id: "notes_header", type: "region", region: "header", children: [
            { id: "notes_title", type: "heading", level: 1, text: formatTitle(query), semanticRole: "display" },
            { id: "new_note_btn", type: "button", label: "+ New Note", intent: "create_note", variant: "primary", semanticRole: "analysis_action", interaction: { mode: "ai_transition", commitOn: ["click"] } },
            { id: "reset_btn", type: "button", label: "Reset", intent: "restart_runtime", variant: "ghost", semanticRole: "navigation", interaction: { mode: "ai_transition", commitOn: ["click"] } },
          ]},
          { id: "note_title_input", type: "text_input", label: "Title", placeholder: "Note title...", binding: "app.inputs.noteTitle", semanticRole: "input", interaction: { mode: "local" } },
          { id: "note_content", type: "textarea", label: "Content", binding: "app.inputs.noteContent", interaction: { mode: "local" } },
          { id: "save_btn", type: "button", label: "Save Note", intent: "save_note", variant: "primary", semanticRole: "analysis_action", interaction: { mode: "ai_transition", commitOn: ["click"], includeLocalStateOnCommit: true } },
          { id: "notes_warning", type: "alert", tone: "warning", title: "Simulated Notes", message: "This is a demo notes app. Notes are not persisted.", semanticRole: "warning" },
        ],
      },
    },
    diagnostics: { eventInterpretedAs: `User searched: "${query}"`, stateTransition: "launcher -> notes", simulatedData: true, modelUsed: "mock" },
  };
}

function buildGenericUtilityApp(appId: string, query: string): AUIRResponse {
  return {
    protocol: "AUIR", version: "0.3",
    next: {
      app: { id: appId, title: formatTitle(query), kind: "utility", description: `Generated app for: ${query}` },
      memory: { app: { simulated: true, query }, session: { currentTask: query, currentView: "main" } },
      ui: {
        id: "generic_screen", type: "screen", title: formatTitle(query), layoutMode: "single",
        children: [
          { id: "generic_header", type: "region", region: "header", children: [
            { id: "generic_title", type: "heading", level: 1, text: formatTitle(query), semanticRole: "display" },
            { id: "reset_btn", type: "button", label: "Reset", intent: "restart_runtime", variant: "ghost", semanticRole: "navigation", interaction: { mode: "ai_transition", commitOn: ["click"] } },
          ]},
          { id: "generic_input", type: "text_input", label: "Input", placeholder: "Enter a value...", binding: "app.inputs.value", semanticRole: "input", interaction: { mode: "local" } },
          { id: "generic_btn", type: "button", label: "Submit", intent: "process_input", variant: "primary", semanticRole: "analysis_action", interaction: { mode: "ai_transition", commitOn: ["click"], includeLocalStateOnCommit: true } },
          { id: "generic_result", type: "metric", label: "Result", value: "--", confidence: "simulated", semanticRole: "simulation_result" },
          { id: "generic_warning", type: "alert", tone: "warning", title: "Simulated App", message: `This "${query}" app runs on the mock runtime. Data is simulated.`, semanticRole: "warning" },
        ],
      },
    },
    diagnostics: { eventInterpretedAs: `User searched: "${query}"`, stateTransition: "launcher -> generic_app", simulatedData: true, modelUsed: "mock" },
  };
}

/** Format query into a clean title (remove "create a", "build a", "make a" prefixes) */
function formatTitle(query: string): string {
  return query
    .replace(/^(create|build|make|generate|design|construct) (a|an|the) /i, "")
    .replace(/^(a|an|the) /i, "")
    .replace(/^[:\s]+/, "")
    .trim()
    // Capitalize first letter of each word
    .replace(/\b\w/g, c => c.toUpperCase());
}

// -----------------------------------------------------------
// UI Tree helpers
// -----------------------------------------------------------

function updateMetricInTree(
  node: unknown,
  targetId: string,
  newValue: string | number
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
  if ("primary" in obj && updateMetricInTree(obj.primary, targetId, newValue)) return true;
  if ("secondary" in obj && updateMetricInTree(obj.secondary, targetId, newValue)) return true;
  if ("tabs" in obj && Array.isArray(obj.tabs)) {
    for (const tab of obj.tabs) {
      if (tab && typeof tab === "object" && "children" in tab && Array.isArray(tab.children)) {
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
  value: unknown
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
  if ("primary" in obj && updateBindingInTree(obj.primary, binding, value)) return true;
  if ("secondary" in obj && updateBindingInTree(obj.secondary, binding, value)) return true;
  if ("tabs" in obj && Array.isArray(obj.tabs)) {
    for (const tab of obj.tabs) {
      if (tab && typeof tab === "object" && "children" in tab && Array.isArray(tab.children)) {
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
  replacement: unknown
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
  if ("primary" in obj && replaceNodeInTree(obj.primary, targetId, replacement)) return true;
  if ("secondary" in obj && replaceNodeInTree(obj.secondary, targetId, replacement)) return true;
  return false;
}
