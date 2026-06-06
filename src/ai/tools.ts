// ============================================================
// AI Tools — MVP 安全工具注册
// ============================================================

import type { AUIRToolDescriptor } from "@/auir/types";

/** MVP 可用工具列表 */
export const availableTools: AUIRToolDescriptor[] = [
  {
    name: "safeCalculator",
    description: "Execute basic mathematical calculations safely.",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Math expression to evaluate" },
      },
      required: ["expression"],
    },
    outputTrustLevel: "real",
    requiresUserConfirmation: false,
  },
  {
    name: "generateChartData",
    description: "Generate simulated chart data based on input parameters.",
    inputSchema: {
      type: "object",
      properties: {
        chartType: { type: "string", enum: ["bar", "line"] },
        params: { type: "object" },
      },
      required: ["chartType"],
    },
    outputTrustLevel: "simulated",
    requiresUserConfirmation: false,
  },
  {
    name: "estimateRocketCycle",
    description: "Return demo rocket cycle estimates — always simulated.",
    inputSchema: {
      type: "object",
      properties: {
        chamberPressureMPa: { type: "number" },
        mixtureRatio: { type: "number" },
        expansionRatio: { type: "number" },
        cycleType: { type: "string" },
      },
      required: ["chamberPressureMPa", "mixtureRatio", "expansionRatio", "cycleType"],
    },
    outputTrustLevel: "estimated",
    requiresUserConfirmation: false,
  },
  {
    name: "summarizeState",
    description: "Summarize current app/session memory for debugging.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputTrustLevel: "real",
    requiresUserConfirmation: false,
  },
];

/** 安全工具执行器 */
export function executeTool(
  toolName: string,
  args: Record<string, unknown>
): { result: unknown; source: "real" | "simulated" | "estimated" } {
  switch (toolName) {
    case "safeCalculator": {
      // WARNING: eval is used for demo only; safeCalculator uses a simple subset
      try {
        const expr = String(args.expression ?? "");
        // Sanitize: only allow numbers, operators, parens, and whitespace
        if (!/^[\d\s+\-*/().%]+$/.test(expr)) {
          throw new Error("Unsafe expression");
        }
        // Safe eval: only numbers and operators allowed
        const result = eval(expr);
        return { result, source: "real" };
      } catch {
        return { result: null, source: "real" };
      }
    }
    case "estimateRocketCycle": {
      const Pc = Number(args.chamberPressureMPa ?? 12);
      const MR = Number(args.mixtureRatio ?? 5.8);
      const eps = Number(args.expansionRatio ?? 80);
      // Simple demo estimates
      const isp = 300 + Pc * 5 + MR * 10 + Math.log(eps) * 30;
      const massFlow = Pc * 15 + MR * 5;
      const thrust = massFlow * isp * 9.81 / 1000;
      return {
        result: {
          ispVac_s: Math.round(isp),
          massFlow_kgs: Math.round(massFlow),
          thrust_kN: Math.round(thrust),
          exitVelocity_ms: Math.round(isp * 9.81 * 0.98),
        },
        source: "estimated",
      };
    }
    case "summarizeState": {
      return { result: { summary: "Current state summarized at " + new Date().toISOString() }, source: "real" };
    }
    default:
      return { result: null, source: "simulated" };
  }
}
