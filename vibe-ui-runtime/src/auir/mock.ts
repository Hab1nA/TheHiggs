import type { AUIRRequest, AUIRResponse, UINode } from "./types";

// ============================================================
// Mock AI Runtime — simulates LLM responses for local dev
// ============================================================

let turnCounter = 0;

export function generateMockResponse(request: AUIRRequest): AUIRResponse {
  turnCounter++;

  const { event } = request;
  const previousState = request.previous;

  // Handle app.search — generate the initial rocket engine analyzer UI
  if (event.type === "app.search") {
    return generateRocketEngineAnalyzer(request, event.query);
  }

  // Handle component.click events
  if (event.type === "component.click") {
    return handleClick(request, event.target.intent);
  }

  // Handle component.value_change events
  if (event.type === "component.value_change") {
    return handleValueChange(request, event.target.binding, event.payload.nextValue);
  }

  // Handle tabs.change events
  if (event.type === "tabs.change") {
    return handleTabChange(request, event.payload.nextTab);
  }

  // Handle modal.close events
  if (event.type === "modal.close") {
    return generateRestartUI(request);
  }

  // Fallback: return a generic response
  return generateFallbackResponse(request);
}

function generateRocketEngineAnalyzer(
  request: AUIRRequest,
  query: string
): AUIRResponse {
  const appKind = detectAppKind(query);
  const previousInputs = (request.previous?.memory?.app?.inputs as Record<string, unknown>) || {};

  const chamberPressure = (previousInputs.chamberPressureMPa as number) ?? 12;
  const mixtureRatio = (previousInputs.mixtureRatio as number) ?? 5.8;
  const expansionRatio = (previousInputs.expansionRatio as number) ?? 80;
  const cycleType = (previousInputs.cycleType as string) ?? "staged_combustion";

  const isp = calculateMockIsp(cycleType, chamberPressure);
  const massFlow = calculateMockMassFlow(chamberPressure, mixtureRatio);

  return {
    protocol: "AUIR",
    version: "0.1",
    next: {
      app: {
        id: "rocket_engine_cycle_analyzer",
        title: "Rocket Engine Cycle Analyzer",
        kind: appKind,
        description: "A simulated engineering dashboard for comparing rocket engine cycles.",
      },
      memory: {
        app: {
          simulated: true,
          inputs: {
            chamberPressureMPa: chamberPressure,
            mixtureRatio,
            expansionRatio,
            cycleType,
          },
          results: {
            isp,
            massFlow,
          },
        },
        session: {
          currentTask: "Analyze and compare rocket engine cycle parameters.",
          currentView: "main_inputs",
        },
      },
      ui: buildAnalyzerUI(chamberPressure, mixtureRatio, expansionRatio, cycleType, isp, massFlow),
    },
    memoryPatch: {
      session: [
        {
          op: "replace",
          path: "/currentTask",
          value: "Analyze and compare rocket engine cycle parameters.",
        },
      ],
      app: [
        { op: "replace", path: "/simulated", value: true },
      ],
    },
    diagnostics: {
      eventInterpretedAs: `user requested: ${query}`,
      stateTransition: "launcher -> rocket_engine_cycle_analyzer",
      simulatedData: true,
    },
  };
}

function handleClick(
  request: AUIRRequest,
  intent?: string
): AUIRResponse {
  const prevState = request.previous;
  const appMemory = (prevState?.memory?.app || {}) as Record<string, unknown>;
  const inputs = (appMemory.inputs || {}) as Record<string, unknown>;

  const chamberPressure = (inputs.chamberPressureMPa as number) ?? 12;
  const mixtureRatio = (inputs.mixtureRatio as number) ?? 5.8;
  const expansionRatio = (inputs.expansionRatio as number) ?? 80;
  const cycleType = (inputs.cycleType as string) ?? "staged_combustion";

  if (intent === "restart_runtime") {
    return generateRestartUI(request);
  }

  if (intent === "compare_cycle_options") {
    return generateComparisonTable(request, inputs);
  }

  if (intent === "back_to_analyzer") {
    const isp = calculateMockIsp(cycleType, chamberPressure);
    const massFlow = calculateMockMassFlow(chamberPressure, mixtureRatio);
    return {
      protocol: "AUIR",
      version: "0.1",
      next: {
        app: {
          id: "rocket_engine_cycle_analyzer",
          title: "Rocket Engine Cycle Analyzer",
          kind: "engineering_tool",
        },
        memory: {
          app: { simulated: true, inputs, results: { isp, massFlow } },
          session: { currentView: "main_inputs" },
        },
        ui: buildAnalyzerUI(chamberPressure, mixtureRatio, expansionRatio, cycleType, isp, massFlow),
      },
      diagnostics: { stateTransition: "comparison -> main_inputs", simulatedData: true },
    };
  }

  if (intent === "recalculate") {
    const newIsp = calculateMockIsp(cycleType, chamberPressure);
    const newMassFlow = calculateMockMassFlow(chamberPressure, mixtureRatio);
    return {
      protocol: "AUIR",
      version: "0.1",
      next: {
        app: {
          id: "rocket_engine_cycle_analyzer",
          title: "Rocket Engine Cycle Analyzer",
          kind: "engineering_tool",
        },
        memory: {
          app: {
            simulated: true,
            inputs,
            results: { isp: newIsp, massFlow: newMassFlow },
          },
          session: { currentView: "main_inputs" },
        },
        ui: buildAnalyzerUI(chamberPressure, mixtureRatio, expansionRatio, cycleType, newIsp, newMassFlow),
      },
      diagnostics: { stateTransition: "recalculated", simulatedData: true },
    };
  }

  // Default click response
  const isp = calculateMockIsp(cycleType, chamberPressure);
  const massFlow = calculateMockMassFlow(chamberPressure, mixtureRatio);
  return {
    protocol: "AUIR",
    version: "0.1",
    next: {
      app: {
        id: "rocket_engine_cycle_analyzer",
        title: "Rocket Engine Cycle Analyzer",
        kind: "engineering_tool",
      },
      memory: {
        app: { simulated: true, inputs, results: { isp, massFlow } },
        session: { currentView: "main_inputs" },
      },
      ui: buildAnalyzerUI(chamberPressure, mixtureRatio, expansionRatio, cycleType, isp, massFlow),
    },
    diagnostics: { stateTransition: "maintained", simulatedData: true },
  };
}

function handleValueChange(
  request: AUIRRequest,
  binding?: string,
  nextValue?: unknown
): AUIRResponse {
  const prevState = request.previous;
  const appMemory = (prevState?.memory?.app || {}) as Record<string, unknown>;
  const inputs = { ...((appMemory.inputs || {}) as Record<string, unknown>) };

  // Update the bound value
  if (binding) {
    setNestedValue(inputs, binding.replace("app.inputs.", ""), nextValue);
  }

  const chamberPressure = (inputs.chamberPressureMPa as number) ?? 12;
  const mixtureRatio = (inputs.mixtureRatio as number) ?? 5.8;
  const expansionRatio = (inputs.expansionRatio as number) ?? 80;
  const cycleType = (inputs.cycleType as string) ?? "staged_combustion";

  const isp = calculateMockIsp(cycleType, chamberPressure);
  const massFlow = calculateMockMassFlow(chamberPressure, mixtureRatio);

  return {
    protocol: "AUIR",
    version: "0.1",
    next: {
      app: {
        id: "rocket_engine_cycle_analyzer",
        title: "Rocket Engine Cycle Analyzer",
        kind: "engineering_tool",
      },
      memory: {
        app: { simulated: true, inputs, results: { isp, massFlow } },
        session: { currentView: "main_inputs" },
      },
      ui: buildAnalyzerUI(chamberPressure, mixtureRatio, expansionRatio, cycleType, isp, massFlow),
    },
    diagnostics: {
      eventInterpretedAs: `value changed: ${binding} = ${nextValue}`,
      stateTransition: "parameter_updated",
      simulatedData: true,
    },
  };
}

function handleTabChange(request: AUIRRequest, nextTab: string): AUIRResponse {
  const prevState = request.previous;
  const appMemory = (prevState?.memory?.app || {}) as Record<string, unknown>;
  const inputs = (appMemory.inputs || {}) as Record<string, unknown>;

  const chamberPressure = (inputs.chamberPressureMPa as number) ?? 12;
  const mixtureRatio = (inputs.mixtureRatio as number) ?? 5.8;
  const expansionRatio = (inputs.expansionRatio as number) ?? 80;
  const cycleType = (inputs.cycleType as string) ?? "staged_combustion";

  return {
    protocol: "AUIR",
    version: "0.1",
    next: {
      app: {
        id: "rocket_engine_cycle_analyzer",
        title: "Rocket Engine Cycle Analyzer",
        kind: "engineering_tool",
      },
      memory: {
        app: { simulated: true, inputs },
        session: { currentView: nextTab },
      },
      ui: buildAnalyzerUI(chamberPressure, mixtureRatio, expansionRatio, cycleType,
        calculateMockIsp(cycleType, chamberPressure),
        calculateMockMassFlow(chamberPressure, mixtureRatio)),
    },
    diagnostics: { stateTransition: `tab -> ${nextTab}`, simulatedData: true },
  };
}

function generateComparisonTable(
  request: AUIRRequest,
  inputs: Record<string, unknown>
): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.1",
    next: {
      app: {
        id: "rocket_engine_cycle_analyzer",
        title: "Rocket Engine Cycle Analyzer",
        kind: "engineering_tool",
      },
      memory: {
        app: { simulated: true, inputs },
        session: { currentView: "comparison" },
      },
      ui: {
        id: "comparison_screen",
        type: "screen",
        title: "Cycle Comparison",
        children: [
          {
            id: "comparison_title",
            type: "heading",
            level: 1,
            text: "Rocket Engine Cycle Comparison",
          },
          {
            id: "comparison_table_panel",
            type: "panel",
            title: "Cycle Performance Estimates",
            children: [
              {
                id: "cycle_table",
                type: "table",
                columns: ["Cycle Type", "Isp (s)", "Chamber Pressure (MPa)", "T/W Ratio", "Complexity"],
                rows: [
                  ["Gas Generator", 320, 7, "Medium", "Low"],
                  ["Expander", 380, 10, "High", "Medium"],
                  ["Staged Combustion", 452, 25, "Very High", "High"],
                  ["Full Flow Staged Comb.", 465, 30, "Very High", "Very High"],
                  ["Tap-Off", 310, 8, "Low-Medium", "Low"],
                ],
              },
              {
                id: "comparison_note",
                type: "alert",
                tone: "info",
                title: "Note",
                message:
                  "Values are simulated approximations. Real performance depends on propellant combination, nozzle design, and many other factors.",
              },
              {
                id: "back_button",
                type: "button",
                label: "← Back to Analyzer",
                intent: "back_to_analyzer",
                variant: "secondary",
              },
            ],
          },
          {
            id: "comparison_chart_panel",
            type: "panel",
            title: "Isp Comparison",
            children: [
              {
                id: "isp_chart",
                type: "chart_bar",
                title: "Estimated Vacuum Isp by Cycle",
                xLabel: "Cycle Type",
                yLabel: "Isp (s)",
                data: [
                  { label: "Gas Gen.", value: 320 },
                  { label: "Expander", value: 380 },
                  { label: "Staged Comb.", value: 452 },
                  { label: "FFSC", value: 465 },
                  { label: "Tap-Off", value: 310 },
                ],
              },
            ],
          },
        ],
      } as UINode,
    },
    diagnostics: {
      stateTransition: "main_inputs -> comparison",
      simulatedData: true,
    },
  };
}

function generateRestartUI(request: AUIRRequest): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.1",
    next: {
      app: {
        id: "launcher",
        title: "Vibe UI Runtime",
        kind: "launcher",
      },
      memory: {
        app: {},
        session: {},
      },
      ui: {
        id: "launcher_screen",
        type: "screen",
        title: "Vibe UI Runtime",
        children: [
          {
            id: "launcher_heading",
            type: "heading",
            level: 1,
            text: "Vibe UI Runtime",
          },
          {
            id: "launcher_description",
            type: "text",
            text: "Search for the app you want to hallucinate.",
            tone: "muted",
          },
        ],
      },
    },
    diagnostics: { stateTransition: "-> launcher", simulatedData: false },
  };
}

function generateFallbackResponse(request: AUIRRequest): AUIRResponse {
  return {
    protocol: "AUIR",
    version: "0.1",
    next: {
      app: { id: "unknown", title: "Unknown", kind: "unknown" },
      memory: { app: {}, session: {} },
      ui: {
        id: "fallback_screen",
        type: "screen",
        title: "AUIR Runtime",
        children: [
          {
            id: "fallback_msg",
            type: "alert",
            tone: "warning",
            title: "Unknown Event",
            message: `The runtime received an event it cannot process: ${request.event.type}`,
          },
        ],
      },
    },
  };
}

// --- Helper Functions ---

function detectAppKind(
  query: string
): "engineering_tool" | "simulation" | "dashboard" | "utility" {
  const q = query.toLowerCase();
  if (q.includes("rocket") || q.includes("engine") || q.includes("cycle"))
    return "engineering_tool";
  if (q.includes("simulat")) return "simulation";
  if (q.includes("dashboard") || q.includes("chart") || q.includes("metric"))
    return "dashboard";
  return "utility";
}

function calculateMockIsp(cycleType: string, chamberPressure: number): number {
  const base: Record<string, number> = {
    gas_generator: 320,
    expander: 380,
    staged_combustion: 452,
    full_flow_staged_combustion: 465,
    tap_off: 310,
  };
  const baseIsp = base[cycleType] ?? 350;
  // Simple pressure-based adjustment
  const pressureFactor = 1 + (chamberPressure - 10) * 0.005;
  return Math.round(baseIsp * pressureFactor);
}

function calculateMockMassFlow(
  chamberPressure: number,
  mixtureRatio: number
): number {
  // Rough estimation: massFlow ∝ chamberPressure / sqrt(mixtureRatio)
  return Math.round((chamberPressure * 20) / Math.sqrt(mixtureRatio));
}

function buildAnalyzerUI(
  chamberPressure: number,
  mixtureRatio: number,
  expansionRatio: number,
  cycleType: string,
  isp: number,
  massFlow: number
): UINode {
  return {
    id: "main_screen",
    type: "screen",
    title: "Rocket Engine Cycle Analyzer",
    children: [
      {
        id: "title",
        type: "heading",
        level: 1,
        text: "Rocket Engine Cycle Analyzer",
      },
      {
        id: "main_container",
        type: "container",
        direction: "row",
        gap: "md",
        children: [
          {
            id: "input_panel",
            type: "panel",
            title: "Engine Inputs",
            children: [
              {
                id: "chamber_pressure",
                type: "number_input",
                label: "Chamber Pressure",
                value: chamberPressure,
                unit: "MPa",
                binding: "app.inputs.chamberPressureMPa",
              },
              {
                id: "mixture_ratio",
                type: "number_input",
                label: "Mixture Ratio (O/F)",
                value: mixtureRatio,
                binding: "app.inputs.mixtureRatio",
              },
              {
                id: "expansion_ratio",
                type: "number_input",
                label: "Expansion Ratio",
                value: expansionRatio,
                binding: "app.inputs.expansionRatio",
              },
              {
                id: "cycle_type",
                type: "select",
                label: "Cycle Type",
                value: cycleType,
                binding: "app.inputs.cycleType",
                options: [
                  { label: "Gas Generator", value: "gas_generator" },
                  { label: "Expander", value: "expander" },
                  { label: "Staged Combustion", value: "staged_combustion" },
                  { label: "Full Flow Staged Comb.", value: "full_flow_staged_combustion" },
                  { label: "Tap-Off", value: "tap_off" },
                ],
              },
              {
                id: "recalculate_btn",
                type: "button",
                label: "Recalculate",
                intent: "recalculate",
                variant: "primary",
              },
            ],
          },
          {
            id: "results_panel",
            type: "panel",
            title: "Estimated Results",
            children: [
              {
                id: "isp_metric",
                type: "metric",
                label: "Estimated Vacuum Isp",
                value: isp,
                unit: "s",
                confidence: "estimated",
              },
              {
                id: "mass_flow_metric",
                type: "metric",
                label: "Estimated Mass Flow",
                value: massFlow,
                unit: "kg/s",
                confidence: "simulated",
              },
              {
                id: "compare_cycles_btn",
                type: "button",
                label: "Compare Cycles",
                intent: "compare_cycle_options",
                variant: "secondary",
              },
            ],
          },
        ],
      },
      {
        id: "simulation_notice",
        type: "alert",
        tone: "warning",
        title: "Simulated Data",
        message:
          "This demo does not run a real propulsion solver. Values are simulated or estimated by the AI runtime.",
      },
    ],
  };
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const keys = path.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current) || typeof current[keys[i]] !== "object") {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}
