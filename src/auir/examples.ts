// ============================================================
// AUIR Examples — 协议示例数据
// ============================================================

import { defaultConstraints } from "./constraints";
import type { AUIRRequest, AUIRResponse } from "./types";

/** App Search 请求示例 */
export function createAppSearchRequest(query: string): AUIRRequest {
  return {
    protocol: "AUIR",
    version: "0.3",
    session: {
      sessionId: "sess_demo",
      turn: 0,
    },
    previous: null,
    event: {
      eventId: "evt_001",
      timestamp: new Date().toISOString(),
      type: "app.search",
      query,
    },
    memory: {
      turn: {},
      session: {},
      app: {},
      user: [],
    },
    constraints: defaultConstraints,
    availableTools: [],
  };
}

/** 示例：火箭发动机循环分析工具响应 */
export function exampleRocketCycleResponse(): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.3",
    next: {
      app: {
        id: "rocket_engine_cycle_analyzer",
        title: "Rocket Engine Cycle Analyzer",
        kind: "engineering_tool",
        description:
          "A simulated engineering dashboard for comparing rocket engine cycles.",
      },
      memory: {
        app: {
          simulated: true,
          inputs: {
            chamberPressureMPa: 12,
            mixtureRatio: 5.8,
            expansionRatio: 80,
            cycleType: "staged_combustion",
          },
        },
        session: {
          currentTask: "Analyze and compare rocket engine cycle parameters.",
          currentView: "main_inputs",
        },
      },
      ui: {
        id: "main_screen",
        type: "screen",
        title: "Rocket Engine Cycle Analyzer",
        layoutMode: "dashboard",
        children: [
          {
            id: "header_toolbar",
            type: "region",
            region: "header",
            children: [
              {
                id: "title_heading",
                type: "heading",
                level: 1,
                text: "Rocket Engine Cycle Analyzer",
                semanticRole: "display",
              },
              {
                id: "reset_button",
                type: "button",
                label: "Reset",
                intent: "restart_runtime",
                variant: "ghost",
                semanticRole: "navigation",
                interaction: {
                  mode: "ai_transition",
                  commitOn: ["click"],
                },
              },
            ],
          },
          {
            id: "main_split",
            type: "split",
            orientation: "horizontal",
            ratio: "2:1",
            primary: {
              id: "main_workspace",
              type: "region",
              region: "main",
              children: [
                {
                  id: "input_panel",
                  type: "panel",
                  title: "Engine Inputs",
                  children: [
                    {
                      id: "chamber_pressure",
                      type: "stepper",
                      label: "Chamber Pressure",
                      value: 12,
                      unit: "MPa",
                      min: 1,
                      max: 50,
                      step: 0.5,
                      binding: "app.inputs.chamberPressureMPa",
                      semanticRole: "input",
                      expectedEffect:
                        "Update chamber pressure used for simulated engine estimates",
                      interaction: { mode: "local" },
                    },
                    {
                      id: "mixture_ratio",
                      type: "slider",
                      label: "Mixture Ratio",
                      value: 5.8,
                      min: 1,
                      max: 10,
                      step: 0.1,
                      binding: "app.inputs.mixtureRatio",
                      semanticRole: "input",
                      interaction: { mode: "local" },
                    },
                    {
                      id: "expansion_ratio",
                      type: "stepper",
                      label: "Expansion Ratio",
                      value: 80,
                      min: 10,
                      max: 200,
                      step: 5,
                      binding: "app.inputs.expansionRatio",
                      semanticRole: "input",
                      interaction: { mode: "local" },
                    },
                    {
                      id: "cycle_type",
                      type: "select",
                      label: "Cycle Type",
                      value: "staged_combustion",
                      binding: "app.inputs.cycleType",
                      semanticRole: "input",
                      options: [
                        { label: "Gas Generator", value: "gas_generator" },
                        { label: "Expander", value: "expander" },
                        { label: "Staged Combustion", value: "staged_combustion" },
                      ],
                      interaction: { mode: "local" },
                    },
                    {
                      id: "calc_button",
                      type: "button",
                      label: "Calculate Performance",
                      intent: "calculate_engine_performance",
                      variant: "primary",
                      semanticRole: "analysis_action",
                      expectedEffect:
                        "Use current local input values to generate performance estimates",
                      interaction: {
                        mode: "ai_transition",
                        commitOn: ["click"],
                        includeLocalStateOnCommit: true,
                      },
                    },
                  ],
                },
                {
                  id: "results_panel",
                  type: "panel",
                  title: "Estimated Results",
                  children: [
                    {
                      id: "results_grid",
                      type: "grid",
                      columns: 2,
                      children: [
                        {
                          id: "isp_metric",
                          type: "metric",
                          label: "Vacuum Isp",
                          value: 452,
                          unit: "s",
                          confidence: "estimated",
                          semanticRole: "simulation_result",
                        },
                        {
                          id: "mass_flow_metric",
                          type: "metric",
                          label: "Mass Flow",
                          value: 245,
                          unit: "kg/s",
                          confidence: "simulated",
                          semanticRole: "simulation_result",
                        },
                        {
                          id: "thrust_metric",
                          type: "metric",
                          label: "Thrust",
                          value: 1100,
                          unit: "kN",
                          confidence: "estimated",
                          semanticRole: "simulation_result",
                        },
                        {
                          id: "exit_vel_metric",
                          type: "metric",
                          label: "Exit Velocity",
                          value: 4430,
                          unit: "m/s",
                          confidence: "simulated",
                          semanticRole: "simulation_result",
                        },
                      ],
                    },
                    {
                      id: "compare_button",
                      type: "button",
                      label: "Compare Cycles",
                      intent: "compare_cycle_options",
                      variant: "secondary",
                      semanticRole: "analysis_action",
                      expectedEffect:
                        "Generate a simulated comparison table for gas generator, expander, and staged combustion cycles",
                      interaction: {
                        mode: "ai_transition",
                        commitOn: ["click"],
                        includeLocalStateOnCommit: true,
                      },
                    },
                  ],
                },
              ],
            },
            secondary: {
              id: "inspector_region",
              type: "region",
              region: "inspector",
              children: [
                {
                  id: "inspector_panel",
                  type: "panel",
                  title: "Inspector",
                  children: [
                    {
                      id: "param_display",
                      type: "panel",
                      title: "Current Parameters",
                      children: [
                        {
                          id: "pc_display",
                          type: "local_value_display",
                          label: "Chamber Pressure",
                          binding: "app.inputs.chamberPressureMPa",
                          unit: "MPa",
                          format: "fixed_1",
                        },
                        {
                          id: "mr_display",
                          type: "local_value_display",
                          label: "Mixture Ratio",
                          binding: "app.inputs.mixtureRatio",
                          format: "fixed_2",
                        },
                        {
                          id: "er_display",
                          type: "local_value_display",
                          label: "Expansion Ratio",
                          binding: "app.inputs.expansionRatio",
                        },
                        {
                          id: "ct_display",
                          type: "local_value_display",
                          label: "Cycle Type",
                          binding: "app.inputs.cycleType",
                          format: "plain",
                        },
                      ],
                    },
                    {
                      id: "warning_alert",
                      type: "alert",
                      tone: "warning",
                      title: "Simulated Data",
                      message:
                        "This demo does not run a real propulsion solver. All values are simulated or estimated.",
                      semanticRole: "warning",
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
    memoryPatch: {
      session: [
        {
          op: "replace",
          path: "/currentTask",
          value: "Analyze and compare rocket engine cycle parameters.",
        },
      ],
      app: [{ op: "add", path: "/simulated", value: true }],
      userCandidates: [],
    },
    toolRequests: [],
    diagnostics: {
      eventInterpretedAs:
        "User requested a simulated rocket engine cycle analysis application",
      stateTransition: "launcher -> rocket_engine_cycle_analyzer",
      simulatedData: true,
    },
  };
}
