// ============================================================
// AI Tools — 工具注册与执行
// ============================================================

import type { AUIRToolDescriptor } from "@/auir/types";
import type {
  ImageSearchOutput,
  ImageSearchParams,
  ResourceDownloadOutput,
  ResourceDownloadParams,
  WebSearchOutput,
  WebSearchParams,
} from "./webTools";
import { downloadResource, imageSearch, webSearch } from "./webTools";

/** MVP 可用工具列表 */
export const availableTools: AUIRToolDescriptor[] = [
  {
    name: "webSearch",
    description:
      "Search the web for real-time information before generating UI. " +
      "Use this when the user's request requires up-to-date facts, current events, " +
      "technical documentation, market data, or any information beyond your training cutoff. " +
      "The search results will be injected into your context so you can build an informed UI. " +
      "DECISION RULE: call this whenever you are uncertain about facts, need current data, " +
      "or the user explicitly asks for real/live/current information.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query string. Be specific and use keywords.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (1-10, default 5).",
        },
        language: {
          type: "string",
          description: "Search language preference (e.g., 'zh-CN', 'en').",
        },
      },
      required: ["query"],
    },
    outputTrustLevel: "real",
    requiresUserConfirmation: false,
  },
  {
    name: "imageSearch",
    description:
      "Search for images on the web. Returns direct image URLs (thumbnails and full-size) " +
      "that can be used in 'image' nodes. Use this when the user needs visual content: " +
      "photos, illustrations, diagrams, logos, icons, or any visual reference. " +
      "Multiple providers are used automatically (Google images, Pixabay, Pexels, Bing). " +
      "PREFER this over webSearch when images are specifically needed.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Image search query. Be descriptive (e.g., 'SpaceX rocket launch' not just 'rocket').",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of image results (1-20, default 5).",
        },
        imageType: {
          type: "string",
          enum: ["photo", "illustration", "all"],
          description: "Image type filter. Default: 'all'.",
        },
      },
      required: ["query"],
    },
    outputTrustLevel: "real",
    requiresUserConfirmation: false,
  },
  {
    name: "downloadResource",
    description:
      "Download an external resource (image, JSON data, text) from a URL to embed in the generated UI. " +
      "Use this to fetch images for cards, icons, avatars, charts backgrounds, or to pull data from public APIs. " +
      "Supported types: image/png, image/jpeg, image/webp, image/gif, image/svg+xml, text/plain, application/json. " +
      "Images are returned as data URLs ready for embedding in 'image' nodes or 'card' image fields. " +
      "Max download size: 5 MB.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "The URL of the resource to download. Must be http:// or https://.",
        },
        expectedType: {
          type: "string",
          enum: ["image", "json", "text", "auto"],
          description:
            "Expected resource type. 'auto' will detect from Content-Type header.",
        },
        maxImageWidth: {
          type: "number",
          description: "Maximum image width in pixels (default 800).",
        },
      },
      required: ["url"],
    },
    outputTrustLevel: "real",
    requiresUserConfirmation: false,
  },
  {
    name: "safeCalculator",
    description: "Execute basic mathematical calculations safely.",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Math expression to evaluate",
        },
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
      required: [
        "chamberPressureMPa",
        "mixtureRatio",
        "expansionRatio",
        "cycleType",
      ],
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

/** 工具执行结果 */
export interface ToolExecutionResult {
  result: unknown;
  source: "real" | "simulated" | "estimated";
}

/** 安全工具执行器 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  switch (toolName) {
    case "webSearch": {
      const params: WebSearchParams = {
        query: String(args.query ?? ""),
        maxResults:
          typeof args.maxResults === "number" ? args.maxResults : undefined,
        language: typeof args.language === "string" ? args.language : undefined,
      };
      if (!params.query.trim()) {
        return { result: { error: "Empty search query" }, source: "real" };
      }
      const output: WebSearchOutput = await webSearch(params);
      return { result: output, source: "real" };
    }
    case "imageSearch": {
      const params: ImageSearchParams = {
        query: String(args.query ?? ""),
        maxResults:
          typeof args.maxResults === "number" ? args.maxResults : undefined,
        imageType:
          typeof args.imageType === "string"
            ? (args.imageType as ImageSearchParams["imageType"])
            : undefined,
      };
      if (!params.query.trim()) {
        return { result: { error: "Empty image search query" }, source: "real" };
      }
      const imgOutput: ImageSearchOutput = await imageSearch(params);
      return { result: imgOutput, source: "real" };
    }
    case "downloadResource": {
      const params: ResourceDownloadParams = {
        url: String(args.url ?? ""),
        expectedType:
          (args.expectedType as ResourceDownloadParams["expectedType"]) ??
          "auto",
        maxImageWidth:
          typeof args.maxImageWidth === "number"
            ? args.maxImageWidth
            : undefined,
      };
      if (!params.url.trim()) {
        return { result: { error: "Empty URL" }, source: "real" };
      }
      const output: ResourceDownloadOutput = await downloadResource(params);
      return { result: output, source: "real" };
    }
    case "safeCalculator": {
      try {
        const expr = String(args.expression ?? "");
        if (!/^[\d\s+\-*/().%]+$/.test(expr)) {
          throw new Error("Unsafe expression");
        }
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
      const isp = 300 + Pc * 5 + MR * 10 + Math.log(eps) * 30;
      const massFlow = Pc * 15 + MR * 5;
      const thrust = (massFlow * isp * 9.81) / 1000;
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
      return {
        result: {
          summary: "Current state summarized at " + new Date().toISOString(),
        },
        source: "real",
      };
    }
    default:
      return { result: null, source: "simulated" };
  }
}

/** 同步工具执行器（用于 mock runtime，不执行真实网络请求） */
export function executeToolSync(
  toolName: string,
  args: Record<string, unknown>,
): ToolExecutionResult {
  switch (toolName) {
    case "webSearch": {
      return {
        result: {
          query: String(args.query ?? ""),
          results: [],
          searchedAt: new Date().toISOString(),
          error:
            "Web search is not available in mock mode. Use real API key for live search.",
        },
        source: "simulated",
      };
    }
    case "imageSearch": {
      return {
        result: {
          query: String(args.query ?? ""),
          results: [],
          searchedAt: new Date().toISOString(),
          error:
            "Image search is not available in mock mode. Use real API key for live search.",
        },
        source: "simulated",
      };
    }
    case "downloadResource": {
      return {
        result: {
          url: String(args.url ?? ""),
          contentType: "",
          resourceType: "unknown",
          data: "",
          byteSize: 0,
          downloadedAt: new Date().toISOString(),
          error:
            "Resource download is not available in mock mode. Use real API key for live download.",
        },
        source: "simulated",
      };
    }
    case "safeCalculator": {
      try {
        const expr = String(args.expression ?? "");
        if (!/^[\d\s+\-*/().%]+$/.test(expr)) {
          throw new Error("Unsafe expression");
        }
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
      const isp = 300 + Pc * 5 + MR * 10 + Math.log(eps) * 30;
      const massFlow = Pc * 15 + MR * 5;
      const thrust = (massFlow * isp * 9.81) / 1000;
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
      return {
        result: {
          summary: "Current state summarized at " + new Date().toISOString(),
        },
        source: "real",
      };
    }
    default:
      return { result: null, source: "simulated" };
  }
}
