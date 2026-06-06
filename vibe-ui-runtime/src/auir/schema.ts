import { z } from "zod";
import type {
  AUIRConstraints,
  AUIRMemory,
  RetrievedUserMemory,
} from "./types";

// --- Default Constraints ---
export const defaultConstraints: AUIRConstraints = {
  renderMode: "full_state",
  allowedComponents: [
    "screen",
    "container",
    "panel",
    "heading",
    "text",
    "button",
    "text_input",
    "number_input",
    "textarea",
    "select",
    "checkbox",
    "slider",
    "table",
    "metric",
    "alert",
    "tabs",
    "modal",
    "code_block",
    "chart_bar",
    "chart_line",
  ],
  maxNodes: 80,
  maxDepth: 8,
  maxTextLength: 4000,
  allowExternalData: false,
  allowCodeExecution: false,
  styleSystem: "semantic_tokens_only",
  transitionPolicy: {
    preferMinimalChange: true,
    preserveStableIds: true,
    preserveUserInputs: true,
    allowMajorRedesignOnlyOn: ["app.search", "explicit_redesign_request"],
  },
};

// --- Initial Memory ---
export function createInitialMemory(): AUIRMemory {
  return {
    turn: {},
    session: {},
    app: {},
    user: [],
  };
}

export function createEmptyUserMemory(): RetrievedUserMemory[] {
  return [];
}

// --- Fallback UI ---
export const FALLBACK_STATE = {
  app: {
    id: "error_app",
    title: "Runtime Error",
    kind: "unknown" as const,
  },
  memory: {
    app: {},
    session: {},
  },
  ui: {
    id: "error_screen",
    type: "screen" as const,
    title: "Runtime Error",
    children: [
      {
        id: "error_alert",
        type: "alert" as const,
        tone: "danger" as const,
        title: "AI UI generation failed",
        message:
          "The model returned an invalid UI state. Try another request.",
      },
      {
        id: "restart_button",
        type: "button" as const,
        label: "Start Over",
        intent: "restart_runtime",
        variant: "primary" as const,
      },
    ],
  },
};

// --- Zod Schemas for Runtime Validation ---

const baseNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  visible: z.boolean().optional(),
});

const screenNodeSchema = baseNodeSchema.extend({
  type: z.literal("screen"),
  title: z.string().optional(),
  children: z.lazy(() => uiNodeSchema.array()),
});

const containerNodeSchema = baseNodeSchema.extend({
  type: z.literal("container"),
  direction: z.enum(["row", "column", "grid"]).optional(),
  gap: z.enum(["xs", "sm", "md", "lg"]).optional(),
  children: z.lazy(() => uiNodeSchema.array()),
});

const panelNodeSchema = baseNodeSchema.extend({
  type: z.literal("panel"),
  title: z.string().optional(),
  children: z.lazy(() => uiNodeSchema.array()),
});

const headingNodeSchema = baseNodeSchema.extend({
  type: z.literal("heading"),
  text: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
});

const textNodeSchema = baseNodeSchema.extend({
  type: z.literal("text"),
  text: z.string(),
  tone: z.enum(["default", "muted", "success", "warning", "danger"]).optional(),
});

const buttonNodeSchema = baseNodeSchema.extend({
  type: z.literal("button"),
  label: z.string(),
  intent: z.string(),
  variant: z.enum(["primary", "secondary", "ghost", "danger"]).optional(),
});

const textInputNodeSchema = baseNodeSchema.extend({
  type: z.literal("text_input"),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  value: z.string().optional(),
  binding: z.string(),
});

const numberInputNodeSchema = baseNodeSchema.extend({
  type: z.literal("number_input"),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  value: z.number().optional(),
  unit: z.string().optional(),
  binding: z.string(),
});

const textareaNodeSchema = baseNodeSchema.extend({
  type: z.literal("textarea"),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  value: z.string().optional(),
  binding: z.string(),
});

const selectNodeSchema = baseNodeSchema.extend({
  type: z.literal("select"),
  label: z.string().optional(),
  value: z.string().optional(),
  binding: z.string(),
  options: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
    })
  ),
});

const checkboxNodeSchema = baseNodeSchema.extend({
  type: z.literal("checkbox"),
  label: z.string(),
  checked: z.boolean(),
  binding: z.string(),
});

const sliderNodeSchema = baseNodeSchema.extend({
  type: z.literal("slider"),
  label: z.string().optional(),
  value: z.number(),
  min: z.number(),
  max: z.number(),
  step: z.number().optional(),
  unit: z.string().optional(),
  binding: z.string(),
});

const tableNodeSchema = baseNodeSchema.extend({
  type: z.literal("table"),
  columns: z.array(z.string()),
  rows: z.array(
    z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
  ),
});

const metricNodeSchema = baseNodeSchema.extend({
  type: z.literal("metric"),
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  confidence: z.enum(["real", "simulated", "estimated"]).optional(),
});

const alertNodeSchema = baseNodeSchema.extend({
  type: z.literal("alert"),
  title: z.string().optional(),
  message: z.string(),
  tone: z.enum(["info", "success", "warning", "danger"]),
});

const tabsNodeSchema = baseNodeSchema.extend({
  type: z.literal("tabs"),
  activeTab: z.string(),
  tabs: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      children: z.lazy(() => uiNodeSchema.array()),
    })
  ),
});

const modalNodeSchema = baseNodeSchema.extend({
  type: z.literal("modal"),
  title: z.string(),
  children: z.lazy(() => uiNodeSchema.array()),
  closeIntent: z.string(),
});

const codeBlockNodeSchema = baseNodeSchema.extend({
  type: z.literal("code_block"),
  language: z.string().optional(),
  code: z.string(),
});

const chartBarNodeSchema = baseNodeSchema.extend({
  type: z.literal("chart_bar"),
  title: z.string().optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  data: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
    })
  ),
});

const chartLineNodeSchema = baseNodeSchema.extend({
  type: z.literal("chart_line"),
  title: z.string().optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  data: z.array(
    z.object({
      x: z.union([z.string(), z.number()]),
      y: z.number(),
    })
  ),
});

export const uiNodeSchema: z.ZodType<import("./types").UINode> = z.discriminatedUnion(
  "type",
  [
    screenNodeSchema,
    containerNodeSchema,
    panelNodeSchema,
    headingNodeSchema,
    textNodeSchema,
    buttonNodeSchema,
    textInputNodeSchema,
    numberInputNodeSchema,
    textareaNodeSchema,
    selectNodeSchema,
    checkboxNodeSchema,
    sliderNodeSchema,
    tableNodeSchema,
    metricNodeSchema,
    alertNodeSchema,
    tabsNodeSchema,
    modalNodeSchema,
    codeBlockNodeSchema,
    chartBarNodeSchema,
    chartLineNodeSchema,
  ]
);

const appDescriptorSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum([
    "launcher",
    "utility",
    "engineering_tool",
    "creative_tool",
    "productivity_tool",
    "simulation",
    "dashboard",
    "unknown",
  ]),
  description: z.string().optional(),
});

const auirStateSchema = z.object({
  app: appDescriptorSchema,
  memory: z.object({
    app: z.record(z.unknown()),
    session: z.record(z.unknown()),
  }),
  ui: uiNodeSchema,
});

const jsonPatchOpSchema = z.object({
  op: z.enum(["add", "replace", "remove"]),
  path: z.string(),
  value: z.unknown().optional(),
});

const userMemoryCandidateSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["explicit", "inferred"]),
  requiresUserConsent: z.boolean(),
});

const memoryPatchSchema = z.object({
  session: z.array(jsonPatchOpSchema).optional(),
  app: z.array(jsonPatchOpSchema).optional(),
  userCandidates: z.array(userMemoryCandidateSchema).optional(),
});

const diagnosticsSchema = z.object({
  eventInterpretedAs: z.string().optional(),
  stateTransition: z.string().optional(),
  simulatedData: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
});

const constraintsSchema = z.object({
  renderMode: z.literal("full_state"),
  allowedComponents: z.array(z.string()),
  maxNodes: z.number(),
  maxDepth: z.number(),
  maxTextLength: z.number(),
  allowExternalData: z.boolean(),
  allowCodeExecution: z.boolean(),
  styleSystem: z.literal("semantic_tokens_only"),
  transitionPolicy: z.object({
    preferMinimalChange: z.boolean(),
    preserveStableIds: z.boolean(),
    preserveUserInputs: z.boolean(),
    allowMajorRedesignOnlyOn: z.array(z.string()),
  }),
});

export const auirRequestSchema = z.object({
  protocol: z.literal("AUIR"),
  version: z.literal("0.1"),
  session: z.object({
    sessionId: z.string(),
    appId: z.string().optional(),
    turn: z.number(),
  }),
  previous: auirStateSchema.nullable(),
  event: z.discriminatedUnion("type", [
    z.object({
      eventId: z.string(),
      timestamp: z.string(),
      type: z.literal("app.search"),
      query: z.string(),
    }),
    z.object({
      eventId: z.string(),
      timestamp: z.string(),
      type: z.literal("component.click"),
      target: z.object({
        id: z.string(),
        type: z.string(),
        label: z.string().optional(),
        intent: z.string().optional(),
      }),
      payload: z.record(z.unknown()).optional(),
    }),
    z.object({
      eventId: z.string(),
      timestamp: z.string(),
      type: z.literal("component.value_change"),
      target: z.object({
        id: z.string(),
        type: z.string(),
        binding: z.string().optional(),
      }),
      payload: z.object({
        previousValue: z.unknown().optional(),
        nextValue: z.unknown(),
      }),
    }),
    z.object({
      eventId: z.string(),
      timestamp: z.string(),
      type: z.literal("form.submit"),
      target: z.object({ id: z.string() }),
      payload: z.object({ values: z.record(z.unknown()) }),
    }),
    z.object({
      eventId: z.string(),
      timestamp: z.string(),
      type: z.literal("tabs.change"),
      target: z.object({ id: z.string() }),
      payload: z.object({
        previousTab: z.string().optional(),
        nextTab: z.string(),
      }),
    }),
    z.object({
      eventId: z.string(),
      timestamp: z.string(),
      type: z.literal("modal.close"),
      target: z.object({
        id: z.string(),
        closeIntent: z.string().optional(),
      }),
    }),
  ]),
  memory: z.object({
    turn: z.record(z.unknown()),
    session: z.record(z.unknown()),
    app: z.record(z.unknown()),
    user: z.array(
      z.object({
        key: z.string(),
        value: z.unknown(),
        source: z.enum(["explicit", "inferred", "system"]),
        confidence: z.number(),
        createdAt: z.string().optional(),
        lastUsedAt: z.string().optional(),
        sensitivity: z.enum(["low", "medium", "high"]).optional(),
      })
    ),
  }),
  constraints: constraintsSchema,
});

export const auirResponseSchema = z.object({
  protocol: z.literal("AUIR"),
  version: z.literal("0.1"),
  next: auirStateSchema,
  memoryPatch: memoryPatchSchema.optional(),
  diagnostics: diagnosticsSchema.optional(),
});
