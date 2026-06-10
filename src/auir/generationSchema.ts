import { jsonSchema } from "ai";
import type { AUIRResponse } from "./types";
import { validateResponse } from "./validate";

type JsonSchema = Record<string, unknown>;

const MAX_GENERATION_UI_DEPTH = 6;

const stringSchema: JsonSchema = { type: "string" };
const numberSchema: JsonSchema = { type: "number" };
const booleanSchema: JsonSchema = { type: "boolean" };
const unknownSchema: JsonSchema = {};

function stringEnum(values: string[]): JsonSchema {
  return { type: "string", enum: values };
}

function literal(value: string | number | boolean): JsonSchema {
  return { const: value };
}

function arrayOf(items: JsonSchema, extra: JsonSchema = {}): JsonSchema {
  return { type: "array", items, ...extra };
}

function recordOf(valueSchema: JsonSchema = unknownSchema): JsonSchema {
  return { type: "object", additionalProperties: valueSchema };
}

function objectOf(
  properties: Record<string, JsonSchema>,
  required: string[] = [],
  additionalProperties = false,
): JsonSchema {
  return {
    type: "object",
    properties,
    required,
    additionalProperties,
  };
}

const semanticRoleSchema = stringEnum([
  "navigation",
  "input",
  "analysis_action",
  "local_adjustment",
  "display",
  "warning",
  "confirmation",
  "tool_result",
  "simulation_result",
]);

const interactionPolicySchema = objectOf(
  {
    mode: stringEnum(["local", "ai_transition", "hybrid"]),
    commitOn: arrayOf(
      stringEnum(["blur", "enter", "change", "click", "submit"]),
    ),
    includeLocalStateOnCommit: booleanSchema,
    debounceMs: numberSchema,
  },
  ["mode"],
);

const layoutHintsSchema = objectOf({
  width: stringEnum([
    "auto",
    "full",
    "content",
    "1/2",
    "1/3",
    "2/3",
    "1/4",
    "3/4",
  ]),
  height: stringEnum(["auto", "full", "content"]),
  align: stringEnum(["start", "center", "end", "stretch"]),
  justify: stringEnum(["start", "center", "end", "between"]),
  grow: booleanSchema,
  order: numberSchema,
});

const styleTokensSchema = objectOf({
  tone: stringEnum([
    "default",
    "muted",
    "primary",
    "success",
    "warning",
    "danger",
  ]),
  density: stringEnum(["compact", "normal", "spacious"]),
  emphasis: stringEnum(["low", "medium", "high"]),
  transition: objectOf({
    type: stringEnum([
      "fade-in",
      "fade-out",
      "slide-in",
      "slide-out",
      "scale-in",
      "scale-out",
      "number-morph",
      "pulse",
      "skeleton",
      "none",
    ]),
    direction: stringEnum(["up", "down", "left", "right"]),
    duration: numberSchema,
    easing: stringEnum([
      "ease",
      "ease-in",
      "ease-out",
      "ease-in-out",
      "linear",
    ]),
    delay: numberSchema,
  }),
});

function baseProperties(type: string): Record<string, JsonSchema> {
  return {
    id: stringSchema,
    type: literal(type),
    visible: booleanSchema,
    semanticRole: semanticRoleSchema,
    intent: stringSchema,
    expectedEffect: stringSchema,
    layout: layoutHintsSchema,
    style: styleTokensSchema,
  };
}

function node(
  type: string,
  properties: Record<string, JsonSchema> = {},
  required: string[] = [],
): JsonSchema {
  return objectOf({ ...baseProperties(type), ...properties }, [
    "id",
    "type",
    ...required,
  ]);
}

function ref(depth: number): JsonSchema {
  return { $ref: `#/$defs/uiNode${depth}` };
}

function childArray(depth: number): JsonSchema {
  return arrayOf(ref(depth));
}

function localActionSchema(): JsonSchema {
  return {
    anyOf: [
      objectOf(
        {
          type: stringEnum(["increment", "decrement"]),
          binding: stringSchema,
          step: numberSchema,
          min: numberSchema,
          max: numberSchema,
        },
        ["type", "binding"],
      ),
      objectOf(
        {
          type: literal("set_value"),
          binding: stringSchema,
          value: unknownSchema,
        },
        ["type", "binding", "value"],
      ),
      objectOf(
        {
          type: literal("toggle"),
          binding: stringSchema,
        },
        ["type", "binding"],
      ),
      objectOf(
        {
          type: literal("append_text"),
          targetBinding: stringSchema,
          text: stringSchema,
        },
        ["type", "targetBinding", "text"],
      ),
      objectOf(
        {
          type: literal("set_active_tab"),
          tabsId: stringSchema,
          nextTab: stringSchema,
          notifyAI: booleanSchema,
        },
        ["type", "tabsId", "nextTab"],
      ),
    ],
  };
}

function terminalNodes(): JsonSchema[] {
  const textValue = { anyOf: [stringSchema, numberSchema] };
  return [
    node("spacer", { size: stringEnum(["xs", "sm", "md", "lg"]) }),
    node("divider", { orientation: stringEnum(["horizontal", "vertical"]) }),
    node("heading", { text: stringSchema, level: { enum: [1, 2, 3, 4] } }, [
      "text",
    ]),
    node("text", { text: stringSchema }, ["text"]),
    node(
      "image",
      {
        src: stringSchema,
        alt: stringSchema,
        width: stringEnum([
          "auto",
          "full",
          "content",
          "1/2",
          "1/3",
          "2/3",
          "1/4",
          "3/4",
        ]),
        height: stringEnum(["auto", "content", "1/2", "1/3"]),
        fit: stringEnum(["cover", "contain", "fill", "none"]),
        radius: stringEnum(["none", "sm", "md", "lg", "full"]),
        caption: stringSchema,
        source: objectOf({ name: stringSchema, url: stringSchema }, ["name"]),
      },
      ["src"],
    ),
    node(
      "metric",
      {
        label: stringSchema,
        value: textValue,
        unit: stringSchema,
        confidence: stringEnum(["real", "simulated", "estimated"]),
      },
      ["label", "value"],
    ),
    node(
      "alert",
      {
        title: stringSchema,
        message: stringSchema,
        tone: stringEnum(["info", "success", "warning", "danger"]),
      },
      ["message", "tone"],
    ),
    node("code_block", { language: stringSchema, code: stringSchema }, [
      "code",
    ]),
    node(
      "table",
      {
        columns: arrayOf(stringSchema),
        rows: arrayOf(
          arrayOf({
            anyOf: [
              stringSchema,
              numberSchema,
              booleanSchema,
              { type: "null" },
            ],
          }),
        ),
      },
      ["columns", "rows"],
    ),
    node(
      "button",
      {
        label: stringSchema,
        intent: stringSchema,
        variant: stringEnum(["primary", "secondary", "ghost", "danger"]),
        interaction: interactionPolicySchema,
        localAction: localActionSchema(),
      },
      ["label", "intent"],
    ),
    node(
      "text_input",
      {
        label: stringSchema,
        placeholder: stringSchema,
        value: stringSchema,
        binding: stringSchema,
        interaction: interactionPolicySchema,
      },
      ["binding"],
    ),
    node(
      "number_input",
      {
        label: stringSchema,
        placeholder: stringSchema,
        value: numberSchema,
        unit: stringSchema,
        min: numberSchema,
        max: numberSchema,
        step: numberSchema,
        binding: stringSchema,
        interaction: interactionPolicySchema,
      },
      ["binding"],
    ),
    node(
      "textarea",
      {
        label: stringSchema,
        placeholder: stringSchema,
        value: stringSchema,
        binding: stringSchema,
        interaction: interactionPolicySchema,
      },
      ["binding"],
    ),
    node(
      "select",
      {
        label: stringSchema,
        value: stringSchema,
        binding: stringSchema,
        options: arrayOf(
          objectOf({ label: stringSchema, value: stringSchema }, [
            "label",
            "value",
          ]),
        ),
        interaction: interactionPolicySchema,
      },
      ["binding", "options"],
    ),
    node(
      "checkbox",
      {
        label: stringSchema,
        checked: booleanSchema,
        binding: stringSchema,
        interaction: interactionPolicySchema,
      },
      ["label", "checked", "binding"],
    ),
    node(
      "slider",
      {
        label: stringSchema,
        value: numberSchema,
        min: numberSchema,
        max: numberSchema,
        step: numberSchema,
        unit: stringSchema,
        binding: stringSchema,
        interaction: interactionPolicySchema,
      },
      ["value", "min", "max", "binding"],
    ),
    node(
      "stepper",
      {
        label: stringSchema,
        value: numberSchema,
        binding: stringSchema,
        min: numberSchema,
        max: numberSchema,
        step: numberSchema,
        unit: stringSchema,
        interaction: interactionPolicySchema,
      },
      ["value", "binding"],
    ),
    node(
      "external_link",
      {
        label: stringSchema,
        url: stringSchema,
        variant: stringEnum(["primary", "secondary", "ghost", "danger"]),
      },
      ["label", "url"],
    ),
    node(
      "local_value_display",
      {
        label: stringSchema,
        binding: stringSchema,
        unit: stringSchema,
        format: stringEnum(["plain", "fixed_1", "fixed_2", "scientific"]),
      },
      ["binding"],
    ),
    node(
      "chart_bar",
      {
        title: stringSchema,
        xLabel: stringSchema,
        yLabel: stringSchema,
        data: arrayOf(
          objectOf({ label: stringSchema, value: numberSchema }, [
            "label",
            "value",
          ]),
        ),
      },
      ["data"],
    ),
    node(
      "chart_line",
      {
        title: stringSchema,
        xLabel: stringSchema,
        yLabel: stringSchema,
        data: arrayOf(
          objectOf(
            { x: { anyOf: [stringSchema, numberSchema] }, y: numberSchema },
            ["x", "y"],
          ),
        ),
      },
      ["data"],
    ),
    node(
      "badge",
      {
        text: stringSchema,
        variant: stringEnum([
          "default",
          "primary",
          "success",
          "warning",
          "danger",
          "info",
        ]),
        size: stringEnum(["sm", "md", "lg"]),
      },
      ["text"],
    ),
    node(
      "progress",
      {
        label: stringSchema,
        value: numberSchema,
        max: numberSchema,
        unit: stringSchema,
        tone: stringEnum([
          "default",
          "primary",
          "success",
          "warning",
          "danger",
        ]),
      },
      ["value"],
    ),
    node(
      "statistic",
      {
        title: stringSchema,
        value: textValue,
        prefix: stringSchema,
        suffix: stringSchema,
        trend: stringEnum(["up", "down", "stable"]),
        trendValue: stringSchema,
        description: stringSchema,
      },
      ["title", "value"],
    ),
    node(
      "timeline",
      {
        items: arrayOf(
          objectOf(
            {
              id: stringSchema,
              title: stringSchema,
              description: stringSchema,
              timestamp: stringSchema,
              tone: stringEnum([
                "default",
                "primary",
                "success",
                "warning",
                "danger",
              ]),
              icon: stringSchema,
            },
            ["id", "title"],
          ),
        ),
      },
      ["items"],
    ),
    node(
      "breadcrumb",
      {
        items: arrayOf(
          objectOf({ label: stringSchema, href: stringSchema }, ["label"]),
        ),
        separator: stringEnum(["/", ">", "›"]),
      },
      ["items"],
    ),
    node(
      "tag",
      {
        text: stringSchema,
        variant: stringEnum([
          "default",
          "primary",
          "success",
          "warning",
          "danger",
          "info",
        ]),
        removable: booleanSchema,
        size: stringEnum(["sm", "md"]),
      },
      ["text"],
    ),
    node(
      "list",
      {
        ordered: booleanSchema,
        gap: stringEnum(["none", "xs", "sm", "md", "lg"]),
        items: arrayOf(
          objectOf(
            {
              id: stringSchema,
              text: stringSchema,
              description: stringSchema,
              icon: stringSchema,
              tone: stringEnum([
                "default",
                "muted",
                "primary",
                "success",
                "warning",
                "danger",
              ]),
            },
            ["id", "text"],
          ),
        ),
      },
      ["items"],
    ),
    node(
      "quote",
      {
        text: stringSchema,
        author: stringSchema,
        source: stringSchema,
        tone: stringEnum(["default", "muted", "primary"]),
      },
      ["text"],
    ),
    node(
      "description_list",
      {
        gap: stringEnum(["none", "xs", "sm", "md", "lg"]),
        layout: stringEnum(["vertical", "horizontal"]),
        items: arrayOf(
          objectOf(
            { id: stringSchema, term: stringSchema, description: stringSchema },
            ["id", "term", "description"],
          ),
        ),
      },
      ["items"],
    ),
    node(
      "empty_state",
      {
        icon: stringSchema,
        title: stringSchema,
        description: stringSchema,
        action: objectOf({ label: stringSchema, intent: stringSchema }, [
          "label",
          "intent",
        ]),
      },
      ["title"],
    ),
    node(
      "gauge",
      {
        title: stringSchema,
        value: numberSchema,
        min: numberSchema,
        max: numberSchema,
        unit: stringSchema,
        thresholds: arrayOf(
          objectOf(
            {
              color: stringEnum(["success", "warning", "danger"]),
              min: numberSchema,
              max: numberSchema,
              label: stringSchema,
            },
            ["color", "min", "max"],
          ),
        ),
        size: stringEnum(["sm", "md", "lg"]),
      },
      ["value", "min", "max"],
    ),
    node(
      "kpi_card",
      {
        title: stringSchema,
        value: textValue,
        unit: stringSchema,
        trend: stringEnum(["up", "down", "stable"]),
        trendValue: stringSchema,
        description: stringSchema,
        tone: stringEnum([
          "default",
          "primary",
          "success",
          "warning",
          "danger",
        ]),
      },
      ["title", "value"],
    ),
    node(
      "heatmap",
      {
        title: stringSchema,
        xLabels: arrayOf(stringSchema),
        yLabels: arrayOf(stringSchema),
        data: arrayOf(arrayOf(numberSchema)),
        colorScale: stringEnum(["blue", "green", "red", "yellow", "purple"]),
        cellSize: stringEnum(["sm", "md", "lg"]),
      },
      ["data"],
    ),
    node(
      "color_swatch",
      {
        title: stringSchema,
        colors: arrayOf(
          objectOf({ value: stringSchema, label: stringSchema }, ["value"]),
        ),
        size: stringEnum(["sm", "md", "lg"]),
      },
      ["colors"],
    ),
    node(
      "radar_chart",
      {
        title: stringSchema,
        axes: arrayOf(stringSchema),
        series: arrayOf(
          objectOf(
            {
              name: stringSchema,
              values: arrayOf(numberSchema),
              color: stringSchema,
            },
            ["name", "values"],
          ),
        ),
        maxValue: numberSchema,
      },
      ["axes", "series"],
    ),
    node(
      "stat_group",
      {
        gap: stringEnum(["none", "xs", "sm", "md", "lg"]),
        columns: { enum: [2, 3, 4] },
        items: arrayOf(
          objectOf(
            {
              id: stringSchema,
              label: stringSchema,
              value: textValue,
              unit: stringSchema,
              trend: stringEnum(["up", "down", "stable"]),
              trendValue: stringSchema,
            },
            ["id", "label", "value"],
          ),
        ),
      },
      ["items"],
    ),
    node(
      "steps",
      {
        current: numberSchema,
        direction: stringEnum(["horizontal", "vertical"]),
        items: arrayOf(
          objectOf(
            {
              id: stringSchema,
              title: stringSchema,
              description: stringSchema,
              status: stringEnum(["wait", "process", "finish", "error"]),
            },
            ["id", "title"],
          ),
        ),
      },
      ["current", "items"],
    ),
    node("clock", {
      format: stringEnum(["time", "date", "datetime", "iso"]),
      timezone: stringSchema,
      interval: numberSchema,
      label: stringSchema,
      variant: stringEnum(["default", "mono", "large"]),
    }),
    node(
      "timer_refresh",
      {
        seconds: numberSchema,
        message: stringSchema,
        showProgress: booleanSchema,
      },
      ["seconds"],
    ),
  ];
}

function recursiveNodes(childDepth: number): JsonSchema[] {
  const child = ref(childDepth);
  const children = childArray(childDepth);
  return [
    node(
      "screen",
      {
        title: stringSchema,
        layoutMode: stringEnum([
          "single",
          "dashboard",
          "workspace",
          "document",
          "wizard",
        ]),
        gap: stringEnum(["none", "xs", "sm", "md", "lg"]),
        children,
      },
      ["children"],
    ),
    node(
      "container",
      {
        direction: stringEnum(["row", "column", "grid"]),
        gap: stringEnum(["none", "xs", "sm", "md", "lg"]),
        wrap: booleanSchema,
        columns: { enum: [1, 2, 3, 4, 5, 6] },
        children,
      },
      ["children"],
    ),
    node(
      "grid",
      {
        columns: { enum: [1, 2, 3, 4, 5, 6, "auto"] },
        gap: stringEnum(["xs", "sm", "md", "lg"]),
        children,
      },
      ["columns", "children"],
    ),
    node(
      "split",
      {
        orientation: stringEnum(["horizontal", "vertical"]),
        ratio: stringEnum(["1:1", "1:2", "2:1", "1:3", "3:1"]),
        primary: child,
        secondary: child,
      },
      ["orientation", "primary", "secondary"],
    ),
    node(
      "region",
      {
        region: stringEnum([
          "header",
          "sidebar",
          "main",
          "inspector",
          "footer",
          "toolbar",
          "results",
          "logs",
        ]),
        gap: stringEnum(["none", "xs", "sm", "md", "lg"]),
        children,
      },
      ["region", "children"],
    ),
    node(
      "toolbar",
      {
        gap: stringEnum(["none", "xs", "sm", "md", "lg"]),
        children,
      },
      ["children"],
    ),
    node(
      "panel",
      {
        title: stringSchema,
        subtitle: stringSchema,
        gap: stringEnum(["none", "xs", "sm", "md", "lg"]),
        children,
      },
      ["children"],
    ),
    node(
      "tabs",
      {
        activeTab: stringSchema,
        gap: stringEnum(["none", "xs", "sm", "md", "lg"]),
        tabs: arrayOf(
          objectOf(
            {
              id: stringSchema,
              label: stringSchema,
              children,
            },
            ["id", "label", "children"],
          ),
        ),
        interaction: interactionPolicySchema,
      },
      ["activeTab", "tabs"],
    ),
    node(
      "modal",
      {
        title: stringSchema,
        children,
        closeIntent: stringSchema,
      },
      ["title", "children", "closeIntent"],
    ),
    node(
      "drawer",
      {
        title: stringSchema,
        side: stringEnum(["left", "right", "bottom"]),
        children,
        closeIntent: stringSchema,
      },
      ["title", "side", "children", "closeIntent"],
    ),
    node(
      "carousel",
      {
        title: stringSchema,
        gap: stringEnum(["none", "xs", "sm", "md", "lg"]),
        visibleItems: { enum: [1, 2, 3, 4] },
        children,
      },
      ["children"],
    ),
    node(
      "accordion",
      {
        defaultOpenIndex: numberSchema,
        gap: stringEnum(["none", "xs", "sm", "md", "lg"]),
        items: arrayOf(
          objectOf(
            {
              id: stringSchema,
              title: stringSchema,
              children,
            },
            ["id", "title", "children"],
          ),
        ),
      },
      ["items"],
    ),
    node(
      "card",
      {
        title: stringSchema,
        subtitle: stringSchema,
        image: stringSchema,
        footer: children,
        gap: stringEnum(["none", "xs", "sm", "md", "lg"]),
        children,
      },
      ["children"],
    ),
  ];
}

function createUiNodeDef(depth: number): JsonSchema {
  const options =
    depth === 0
      ? terminalNodes()
      : [...recursiveNodes(depth - 1), ...terminalNodes()];
  return { anyOf: options };
}

function createDefs(): Record<string, JsonSchema> {
  const defs: Record<string, JsonSchema> = {};
  for (let depth = 0; depth <= MAX_GENERATION_UI_DEPTH; depth++) {
    defs[`uiNode${depth}`] = createUiNodeDef(depth);
  }
  return defs;
}

const appDescriptorSchema = objectOf(
  {
    id: stringSchema,
    title: stringSchema,
    kind: stringEnum([
      "launcher",
      "utility",
      "engineering_tool",
      "creative_tool",
      "productivity_tool",
      "simulation",
      "dashboard",
      "unknown",
    ]),
    description: stringSchema,
  },
  ["id", "title", "kind"],
);

const memorySchema = objectOf(
  {
    app: recordOf(),
    session: recordOf(),
  },
  ["app", "session"],
);

const diagnosticsSchema = objectOf({
  eventInterpretedAs: stringSchema,
  stateTransition: stringSchema,
  simulatedData: booleanSchema,
  warnings: arrayOf(stringSchema),
  modelUsed: stringSchema,
  turnCount: numberSchema,
  nodeCount: numberSchema,
  errors: arrayOf(stringSchema),
});

const memoryPatchSchema = objectOf({
  session: arrayOf(
    objectOf(
      {
        op: stringEnum(["add", "replace", "remove"]),
        path: stringSchema,
        value: unknownSchema,
      },
      ["op", "path"],
    ),
  ),
  app: arrayOf(
    objectOf(
      {
        op: stringEnum(["add", "replace", "remove"]),
        path: stringSchema,
        value: unknownSchema,
      },
      ["op", "path"],
    ),
  ),
  userCandidates: arrayOf(
    objectOf(
      {
        key: stringSchema,
        value: unknownSchema,
        reason: stringSchema,
        confidence: numberSchema,
        source: stringEnum(["explicit", "inferred"]),
        requiresUserConsent: booleanSchema,
      },
      ["key", "value", "reason", "confidence", "source", "requiresUserConsent"],
    ),
  ),
});

export const auirResponseGenerationJsonSchema: JsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    protocol: literal("AUIR"),
    version: literal("0.3"),
    next: objectOf(
      {
        app: appDescriptorSchema,
        memory: memorySchema,
        ui: ref(MAX_GENERATION_UI_DEPTH),
      },
      ["app", "memory", "ui"],
    ),
    memoryPatch: memoryPatchSchema,
    toolRequests: arrayOf(
      objectOf(
        {
          id: stringSchema,
          toolName: stringSchema,
          args: recordOf(),
          reason: stringSchema,
          requiresUserConfirmation: booleanSchema,
        },
        ["id", "toolName", "args", "reason", "requiresUserConfirmation"],
      ),
    ),
    diagnostics: diagnosticsSchema,
  },
  required: ["protocol", "version", "next"],
  additionalProperties: false,
  $defs: createDefs(),
};

export const auirResponseGenerationSchema = jsonSchema<AUIRResponse>(
  auirResponseGenerationJsonSchema,
  {
    validate(value) {
      const result = validateResponse(value);
      if (result.ok) return { success: true, value: result.value };
      return {
        success: false,
        error: new Error(result.errors.join("; ")),
      };
    },
  },
);
