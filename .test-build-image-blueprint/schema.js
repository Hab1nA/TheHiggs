"use strict";
// ============================================================
// AUIR Zod Schema — 运行时校验 + AI 模型输出合同
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.auirResponseSchema = exports.auirRequestSchema = exports.auirConstraintsSchema = exports.auirStateSchema = exports.auirDiagnosticsSchema = exports.auirToolRequestSchema = exports.auirToolDescriptorSchema = exports.auirMemoryPatchSchema = exports.userMemoryCandidateSchema = exports.jsonPatchOperationSchema = exports.auirMemorySchema = exports.retrievedUserMemorySchema = exports.auirAppDescriptorSchema = exports.auirSessionSchema = exports.auirEventSchema = exports.timerRefreshEventSchema = exports.runtimeCommandEventSchema = exports.modalCloseEventSchema = exports.tabChangeEventSchema = exports.formSubmitEventSchema = exports.componentCommitEventSchema = exports.componentClickEventSchema = exports.appSearchEventSchema = exports.clientSnapshotSchema = exports.localUIStateSchema = exports.uiNodeSchema = exports.externalLinkNodeSchema = exports.imageBlueprintSchema = exports.imageSlotPlanItemSchema = void 0;
const zod_1 = require("zod");
// -----------------------------------------------------------
// 基础枚举
// -----------------------------------------------------------
const semanticRoleSchema = zod_1.z.enum([
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
const interactionModeSchema = zod_1.z.enum(["local", "ai_transition", "hybrid"]);
const commitTriggerSchema = zod_1.z.enum([
    "blur",
    "enter",
    "change",
    "click",
    "submit",
]);
const interactionPolicySchema = zod_1.z.object({
    mode: interactionModeSchema,
    commitOn: zod_1.z.array(commitTriggerSchema).optional(),
    includeLocalStateOnCommit: zod_1.z.boolean().optional(),
    debounceMs: zod_1.z.number().optional(),
});
const nodeLayoutHintsSchema = zod_1.z.object({
    width: zod_1.z
        .enum(["auto", "full", "content", "1/2", "1/3", "2/3", "1/4", "3/4"])
        .optional(),
    height: zod_1.z.enum(["auto", "full", "content"]).optional(),
    align: zod_1.z.enum(["start", "center", "end", "stretch"]).optional(),
    justify: zod_1.z.enum(["start", "center", "end", "between"]).optional(),
    grow: zod_1.z.boolean().optional(),
    order: zod_1.z.number().optional(),
});
const nodeStyleTokensSchema = zod_1.z.object({
    tone: zod_1.z
        .enum(["default", "muted", "primary", "success", "warning", "danger"])
        .optional(),
    density: zod_1.z.enum(["compact", "normal", "spacious"]).optional(),
    emphasis: zod_1.z.enum(["low", "medium", "high"]).optional(),
});
const baseNodeExtras = {
    id: zod_1.z.string(),
    visible: zod_1.z.boolean().optional(),
    semanticRole: semanticRoleSchema.optional(),
    intent: zod_1.z.string().optional(),
    expectedEffect: zod_1.z.string().optional(),
    layout: nodeLayoutHintsSchema.optional(),
    style: nodeStyleTokensSchema.optional(),
};
// -----------------------------------------------------------
// Forward-declare recursive UI node reference
// -----------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _uiNode = zod_1.z.lazy(() => exports.uiNodeSchema);
const _ui = _uiNode;
const _uiArray = zod_1.z.array(_uiNode);
// -----------------------------------------------------------
// UI Node Schemas
// -----------------------------------------------------------
const screenNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("screen"),
    title: zod_1.z.string().optional(),
    layoutMode: zod_1.z
        .enum(["single", "dashboard", "workspace", "document", "wizard"])
        .optional(),
    gap: zod_1.z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
    children: _uiArray,
});
const containerNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("container"),
    direction: zod_1.z.enum(["row", "column", "grid"]).optional(),
    gap: zod_1.z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
    wrap: zod_1.z.boolean().optional(),
    columns: zod_1.z
        .union([
        zod_1.z.literal(1),
        zod_1.z.literal(2),
        zod_1.z.literal(3),
        zod_1.z.literal(4),
        zod_1.z.literal(5),
        zod_1.z.literal(6),
    ])
        .optional(),
    children: _uiArray,
});
const gridNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("grid"),
    columns: zod_1.z.union([
        zod_1.z.literal(1),
        zod_1.z.literal(2),
        zod_1.z.literal(3),
        zod_1.z.literal(4),
        zod_1.z.literal(5),
        zod_1.z.literal(6),
        zod_1.z.literal("auto"),
    ]),
    gap: zod_1.z.enum(["xs", "sm", "md", "lg"]).optional(),
    children: _uiArray,
});
const splitNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("split"),
    orientation: zod_1.z.enum(["horizontal", "vertical"]),
    ratio: zod_1.z.enum(["1:1", "1:2", "2:1", "1:3", "3:1"]).optional(),
    primary: _ui,
    secondary: _ui,
});
const regionNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("region"),
    region: zod_1.z.enum([
        "header",
        "sidebar",
        "main",
        "inspector",
        "footer",
        "toolbar",
        "results",
        "logs",
    ]),
    gap: zod_1.z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
    children: _uiArray,
});
const toolbarNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("toolbar"),
    gap: zod_1.z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
    children: _uiArray,
});
const spacerNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("spacer"),
    size: zod_1.z.enum(["xs", "sm", "md", "lg"]).optional(),
});
const dividerNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("divider"),
    orientation: zod_1.z.enum(["horizontal", "vertical"]).optional(),
});
const panelNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("panel"),
    title: zod_1.z.string().optional(),
    subtitle: zod_1.z.string().optional(),
    gap: zod_1.z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
    children: _uiArray,
});
const headingNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("heading"),
    text: zod_1.z.string(),
    level: zod_1.z
        .union([zod_1.z.literal(1), zod_1.z.literal(2), zod_1.z.literal(3), zod_1.z.literal(4)])
        .optional(),
});
const textNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("text"),
    text: zod_1.z.string(),
});
const imageNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("image"),
    src: zod_1.z.string().describe("Image URL (data: URL or server-proxied safe URL)"),
    alt: zod_1.z.string().optional(),
    width: zod_1.z
        .enum(["auto", "full", "content", "1/2", "1/3", "2/3", "1/4", "3/4"])
        .optional(),
    height: zod_1.z.enum(["auto", "content", "1/2", "1/3"]).optional(),
    fit: zod_1.z.enum(["cover", "contain", "fill", "none"]).optional(),
    radius: zod_1.z.enum(["none", "sm", "md", "lg", "full"]).optional(),
    caption: zod_1.z.string().optional(),
    source: zod_1.z
        .object({
        name: zod_1.z.string(),
        url: zod_1.z.string().optional(),
    })
        .optional(),
});
const metricNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("metric"),
    label: zod_1.z.string(),
    value: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
    unit: zod_1.z.string().optional(),
    confidence: zod_1.z.enum(["real", "simulated", "estimated"]).optional(),
});
exports.imageSlotPlanItemSchema = zod_1.z.object({
    slotId: zod_1.z.string().describe("Unique slot identifier, e.g. s1, s2"),
    purpose: zod_1.z
        .string()
        .describe("Semantic purpose for this image, e.g. hero cover, card thumbnail, section illustration"),
    queryCandidates: zod_1.z
        .array(zod_1.z.string())
        .min(1)
        .max(4)
        .describe("2-4 precise search queries for this slot"),
    preferredAspect: zod_1.z
        .enum(["16:9", "4:3", "3:2", "1:1", "3:4", "auto"])
        .optional()
        .describe("Preferred aspect ratio when multiple candidates exist"),
    required: zod_1.z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether the final UI must include an image for this slot"),
    bindTarget: zod_1.z.object({
        type: zod_1.z.enum(["image", "card"]),
        nodeId: zod_1.z.string().optional(),
        sectionHint: zod_1.z.string().optional(),
    }),
});
exports.imageBlueprintSchema = zod_1.z.object({
    summary: zod_1.z
        .string()
        .optional()
        .describe("Short summary of why these images are needed"),
    slots: zod_1.z
        .array(exports.imageSlotPlanItemSchema)
        .min(0)
        .max(12)
        .describe("Planned image slots that need real images"),
});
const alertNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("alert"),
    title: zod_1.z.string().optional(),
    message: zod_1.z.string(),
    tone: zod_1.z.enum(["info", "success", "warning", "danger"]),
});
const codeBlockNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("code_block"),
    language: zod_1.z.string().optional(),
    code: zod_1.z.string(),
});
const tableNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("table"),
    columns: zod_1.z.array(zod_1.z.string()),
    rows: zod_1.z.array(zod_1.z.array(zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean(), zod_1.z.null()]))),
});
const localActionSchema = zod_1.z.discriminatedUnion("type", [
    zod_1.z.object({
        type: zod_1.z.enum(["increment", "decrement"]),
        binding: zod_1.z.string(),
        step: zod_1.z.number().optional(),
        min: zod_1.z.number().optional(),
        max: zod_1.z.number().optional(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("set_value"),
        binding: zod_1.z.string(),
        value: zod_1.z.unknown(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("toggle"),
        binding: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("append_text"),
        targetBinding: zod_1.z.string(),
        text: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("set_active_tab"),
        tabsId: zod_1.z.string(),
        nextTab: zod_1.z.string(),
        notifyAI: zod_1.z.boolean().optional(),
    }),
]);
const buttonNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("button"),
    label: zod_1.z.string(),
    intent: zod_1.z.string(),
    variant: zod_1.z.enum(["primary", "secondary", "ghost", "danger"]).optional(),
    interaction: interactionPolicySchema.optional(),
    localAction: localActionSchema.optional(),
});
const textInputNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("text_input"),
    label: zod_1.z.string().optional(),
    placeholder: zod_1.z.string().optional(),
    value: zod_1.z.string().optional(),
    binding: zod_1.z.string(),
    interaction: interactionPolicySchema.optional(),
});
const numberInputNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("number_input"),
    label: zod_1.z.string().optional(),
    placeholder: zod_1.z.string().optional(),
    value: zod_1.z.number().optional(),
    unit: zod_1.z.string().optional(),
    min: zod_1.z.number().optional(),
    max: zod_1.z.number().optional(),
    step: zod_1.z.number().optional(),
    binding: zod_1.z.string(),
    interaction: interactionPolicySchema.optional(),
});
const textareaNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("textarea"),
    label: zod_1.z.string().optional(),
    placeholder: zod_1.z.string().optional(),
    value: zod_1.z.string().optional(),
    binding: zod_1.z.string(),
    interaction: interactionPolicySchema.optional(),
});
const selectNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("select"),
    label: zod_1.z.string().optional(),
    value: zod_1.z.string().optional(),
    binding: zod_1.z.string(),
    options: zod_1.z.array(zod_1.z.object({ label: zod_1.z.string(), value: zod_1.z.string() })),
    interaction: interactionPolicySchema.optional(),
});
const checkboxNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("checkbox"),
    label: zod_1.z.string(),
    checked: zod_1.z.boolean(),
    binding: zod_1.z.string(),
    interaction: interactionPolicySchema.optional(),
});
const sliderNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("slider"),
    label: zod_1.z.string().optional(),
    value: zod_1.z.number(),
    min: zod_1.z.number(),
    max: zod_1.z.number(),
    step: zod_1.z.number().optional(),
    unit: zod_1.z.string().optional(),
    binding: zod_1.z.string(),
    interaction: interactionPolicySchema.optional(),
});
const stepperNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("stepper"),
    label: zod_1.z.string().optional(),
    value: zod_1.z.number(),
    binding: zod_1.z.string(),
    min: zod_1.z.number().optional(),
    max: zod_1.z.number().optional(),
    step: zod_1.z.number().optional(),
    unit: zod_1.z.string().optional(),
    interaction: interactionPolicySchema.optional(),
});
exports.externalLinkNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("external_link"),
    label: zod_1.z.string(),
    url: zod_1.z.string(),
    variant: zod_1.z.enum(["primary", "secondary", "ghost", "danger"]).optional(),
});
const localValueDisplayNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("local_value_display"),
    label: zod_1.z.string().optional(),
    binding: zod_1.z.string(),
    unit: zod_1.z.string().optional(),
    format: zod_1.z.enum(["plain", "fixed_1", "fixed_2", "scientific"]).optional(),
});
const tabsNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("tabs"),
    activeTab: zod_1.z.string(),
    gap: zod_1.z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
    tabs: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        label: zod_1.z.string(),
        children: _uiArray,
    })),
    interaction: interactionPolicySchema.optional(),
});
const modalNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("modal"),
    title: zod_1.z.string(),
    children: _uiArray,
    closeIntent: zod_1.z.string(),
});
const drawerNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("drawer"),
    title: zod_1.z.string(),
    side: zod_1.z.enum(["left", "right", "bottom"]),
    children: _uiArray,
    closeIntent: zod_1.z.string(),
});
const chartBarNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("chart_bar"),
    title: zod_1.z.string().optional(),
    xLabel: zod_1.z.string().optional(),
    yLabel: zod_1.z.string().optional(),
    data: zod_1.z.array(zod_1.z.object({ label: zod_1.z.string(), value: zod_1.z.number() })),
});
const chartLineNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("chart_line"),
    title: zod_1.z.string().optional(),
    xLabel: zod_1.z.string().optional(),
    yLabel: zod_1.z.string().optional(),
    data: zod_1.z.array(zod_1.z.object({ x: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]), y: zod_1.z.number() })),
});
// -----------------------------------------------------------
// v0.3.1 — Extended Node Schemas
// -----------------------------------------------------------
const carouselNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("carousel"),
    title: zod_1.z.string().optional(),
    gap: zod_1.z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
    visibleItems: zod_1.z
        .union([zod_1.z.literal(1), zod_1.z.literal(2), zod_1.z.literal(3), zod_1.z.literal(4)])
        .optional(),
    children: _uiArray,
});
const badgeNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("badge"),
    text: zod_1.z.string(),
    variant: zod_1.z
        .enum(["default", "primary", "success", "warning", "danger", "info"])
        .optional(),
    size: zod_1.z.enum(["sm", "md", "lg"]).optional(),
});
const progressNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("progress"),
    label: zod_1.z.string().optional(),
    value: zod_1.z.number(),
    max: zod_1.z.number().optional(),
    unit: zod_1.z.string().optional(),
    tone: zod_1.z
        .enum(["default", "primary", "success", "warning", "danger"])
        .optional(),
});
const statisticNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("statistic"),
    title: zod_1.z.string(),
    value: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
    prefix: zod_1.z.string().optional(),
    suffix: zod_1.z.string().optional(),
    trend: zod_1.z.enum(["up", "down", "stable"]).optional(),
    trendValue: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
});
const timelineNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("timeline"),
    items: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        title: zod_1.z.string(),
        description: zod_1.z.string().optional(),
        timestamp: zod_1.z.string().optional(),
        tone: zod_1.z
            .enum(["default", "primary", "success", "warning", "danger"])
            .optional(),
        icon: zod_1.z.string().optional(),
    })),
});
const accordionNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("accordion"),
    defaultOpenIndex: zod_1.z.number().optional(),
    gap: zod_1.z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
    items: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        title: zod_1.z.string(),
        children: _uiArray,
    })),
});
const breadcrumbNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("breadcrumb"),
    items: zod_1.z.array(zod_1.z.object({
        label: zod_1.z.string(),
        href: zod_1.z.string().optional(),
    })),
    separator: zod_1.z.enum(["/", ">", "›"]).optional(),
});
const tagNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("tag"),
    text: zod_1.z.string(),
    variant: zod_1.z
        .enum(["default", "primary", "success", "warning", "danger", "info"])
        .optional(),
    removable: zod_1.z.boolean().optional(),
    size: zod_1.z.enum(["sm", "md"]).optional(),
});
const listNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("list"),
    ordered: zod_1.z.boolean().optional(),
    gap: zod_1.z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
    items: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        text: zod_1.z.string(),
        description: zod_1.z.string().optional(),
        icon: zod_1.z.string().optional(),
        tone: zod_1.z
            .enum(["default", "muted", "primary", "success", "warning", "danger"])
            .optional(),
    })),
});
const quoteNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("quote"),
    text: zod_1.z.string(),
    author: zod_1.z.string().optional(),
    source: zod_1.z.string().optional(),
    tone: zod_1.z.enum(["default", "muted", "primary"]).optional(),
});
const cardNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("card"),
    title: zod_1.z.string().optional(),
    subtitle: zod_1.z.string().optional(),
    image: zod_1.z.string().optional(),
    footer: _uiArray.optional(),
    gap: zod_1.z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
    children: _uiArray,
});
const descriptionListNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("description_list"),
    gap: zod_1.z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
    layout: zod_1.z.enum(["vertical", "horizontal"]).optional(),
    items: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        term: zod_1.z.string(),
        description: zod_1.z.string(),
    })),
});
const emptyStateNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("empty_state"),
    icon: zod_1.z.string().optional(),
    title: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    action: zod_1.z
        .object({
        label: zod_1.z.string(),
        intent: zod_1.z.string(),
    })
        .optional(),
});
const gaugeNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("gauge"),
    title: zod_1.z.string().optional(),
    value: zod_1.z.number(),
    min: zod_1.z.number(),
    max: zod_1.z.number(),
    unit: zod_1.z.string().optional(),
    thresholds: zod_1.z
        .array(zod_1.z.object({
        color: zod_1.z.enum(["success", "warning", "danger"]),
        min: zod_1.z.number(),
        max: zod_1.z.number(),
        label: zod_1.z.string().optional(),
    }))
        .optional(),
    size: zod_1.z.enum(["sm", "md", "lg"]).optional(),
});
const kpiCardNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("kpi_card"),
    title: zod_1.z.string(),
    value: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
    unit: zod_1.z.string().optional(),
    trend: zod_1.z.enum(["up", "down", "stable"]).optional(),
    trendValue: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    tone: zod_1.z
        .enum(["default", "primary", "success", "warning", "danger"])
        .optional(),
});
const heatmapNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("heatmap"),
    title: zod_1.z.string().optional(),
    xLabels: zod_1.z.array(zod_1.z.string()).optional(),
    yLabels: zod_1.z.array(zod_1.z.string()).optional(),
    data: zod_1.z.array(zod_1.z.array(zod_1.z.number())),
    colorScale: zod_1.z.enum(["blue", "green", "red", "yellow", "purple"]).optional(),
    cellSize: zod_1.z.enum(["sm", "md", "lg"]).optional(),
});
const colorSwatchNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("color_swatch"),
    title: zod_1.z.string().optional(),
    colors: zod_1.z.array(zod_1.z.object({
        value: zod_1.z.string(),
        label: zod_1.z.string().optional(),
    })),
    size: zod_1.z.enum(["sm", "md", "lg"]).optional(),
});
const radarChartNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("radar_chart"),
    title: zod_1.z.string().optional(),
    axes: zod_1.z.array(zod_1.z.string()),
    series: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        values: zod_1.z.array(zod_1.z.number()),
        color: zod_1.z.string().optional(),
    })),
    maxValue: zod_1.z.number().optional(),
});
const statGroupNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("stat_group"),
    gap: zod_1.z.enum(["none", "xs", "sm", "md", "lg"]).optional(),
    columns: zod_1.z.union([zod_1.z.literal(2), zod_1.z.literal(3), zod_1.z.literal(4)]).optional(),
    items: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        label: zod_1.z.string(),
        value: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
        unit: zod_1.z.string().optional(),
        trend: zod_1.z.enum(["up", "down", "stable"]).optional(),
        trendValue: zod_1.z.string().optional(),
    })),
});
const stepsNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("steps"),
    current: zod_1.z.number(),
    direction: zod_1.z.enum(["horizontal", "vertical"]).optional(),
    items: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        title: zod_1.z.string(),
        description: zod_1.z.string().optional(),
        status: zod_1.z.enum(["wait", "process", "finish", "error"]).optional(),
    })),
});
const clockNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("clock"),
    format: zod_1.z.enum(["time", "date", "datetime", "iso"]).optional(),
    timezone: zod_1.z.string().optional(),
    interval: zod_1.z.number().optional(),
    label: zod_1.z.string().optional(),
    variant: zod_1.z.enum(["default", "mono", "large"]).optional(),
});
const timerRefreshNodeSchema = zod_1.z.object({
    ...baseNodeExtras,
    type: zod_1.z.literal("timer_refresh"),
    seconds: zod_1.z
        .number()
        .min(1)
        .max(300)
        .default(3)
        .describe("延迟秒数（1-300），默认 3 秒"),
    message: zod_1.z.string().optional().describe("倒计时期间显示的提示消息"),
    showProgress: zod_1.z.boolean().optional().describe("是否显示进度条"),
});
// -----------------------------------------------------------
// UINode — Discriminated Union of all node types
// -----------------------------------------------------------
exports.uiNodeSchema = zod_1.z.discriminatedUnion("type", [
    screenNodeSchema,
    containerNodeSchema,
    gridNodeSchema,
    splitNodeSchema,
    regionNodeSchema,
    toolbarNodeSchema,
    spacerNodeSchema,
    dividerNodeSchema,
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
    stepperNodeSchema,
    exports.externalLinkNodeSchema,
    localValueDisplayNodeSchema,
    tableNodeSchema,
    metricNodeSchema,
    alertNodeSchema,
    tabsNodeSchema,
    modalNodeSchema,
    drawerNodeSchema,
    codeBlockNodeSchema,
    chartBarNodeSchema,
    chartLineNodeSchema,
    imageNodeSchema,
    // v0.3.1 — Extended Nodes
    carouselNodeSchema,
    badgeNodeSchema,
    progressNodeSchema,
    statisticNodeSchema,
    timelineNodeSchema,
    accordionNodeSchema,
    breadcrumbNodeSchema,
    tagNodeSchema,
    listNodeSchema,
    quoteNodeSchema,
    cardNodeSchema,
    descriptionListNodeSchema,
    emptyStateNodeSchema,
    gaugeNodeSchema,
    kpiCardNodeSchema,
    heatmapNodeSchema,
    colorSwatchNodeSchema,
    radarChartNodeSchema,
    statGroupNodeSchema,
    stepsNodeSchema,
    clockNodeSchema,
    timerRefreshNodeSchema,
]);
// -----------------------------------------------------------
// Event Schemas
// -----------------------------------------------------------
exports.localUIStateSchema = zod_1.z.object({
    values: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    dirtyBindings: zod_1.z.array(zod_1.z.string()),
    updatedAt: zod_1.z.string(),
});
exports.clientSnapshotSchema = zod_1.z.object({
    localState: exports.localUIStateSchema,
    currentVisibleBindings: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
});
exports.appSearchEventSchema = zod_1.z.object({
    eventId: zod_1.z.string(),
    timestamp: zod_1.z.string(),
    type: zod_1.z.literal("app.search"),
    query: zod_1.z.string(),
    refine: zod_1.z.boolean().optional(),
    thinking: zod_1.z.boolean().optional(),
    postProcess: zod_1.z.boolean().optional(),
    refinedPrompt: zod_1.z.string().optional(),
    refinedContext: zod_1.z
        .object({
        appKind: zod_1.z.string().optional(),
        appTitle: zod_1.z.string().optional(),
        appDescription: zod_1.z.string().optional(),
        keyFeatures: zod_1.z.array(zod_1.z.string()).optional(),
        suggestedLayout: zod_1.z.string().optional(),
        suggestedComponents: zod_1.z.array(zod_1.z.string()).optional(),
    })
        .optional(),
});
exports.componentClickEventSchema = zod_1.z.object({
    eventId: zod_1.z.string(),
    timestamp: zod_1.z.string(),
    type: zod_1.z.literal("component.click"),
    target: zod_1.z.object({
        id: zod_1.z.string(),
        type: zod_1.z.string(),
        label: zod_1.z.string().optional(),
        intent: zod_1.z.string().optional(),
        semanticRole: zod_1.z.string().optional(),
        expectedEffect: zod_1.z.string().optional(),
    }),
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    clientSnapshot: exports.clientSnapshotSchema.optional(),
});
exports.componentCommitEventSchema = zod_1.z.object({
    eventId: zod_1.z.string(),
    timestamp: zod_1.z.string(),
    type: zod_1.z.literal("component.commit"),
    target: zod_1.z.object({
        id: zod_1.z.string(),
        type: zod_1.z.string(),
        binding: zod_1.z.string().optional(),
        semanticRole: zod_1.z.string().optional(),
        expectedEffect: zod_1.z.string().optional(),
    }),
    payload: zod_1.z.object({
        committedBinding: zod_1.z.string().optional(),
        previousValue: zod_1.z.unknown().optional(),
        nextValue: zod_1.z.unknown().optional(),
    }),
    clientSnapshot: exports.clientSnapshotSchema,
});
exports.formSubmitEventSchema = zod_1.z.object({
    eventId: zod_1.z.string(),
    timestamp: zod_1.z.string(),
    type: zod_1.z.literal("form.submit"),
    target: zod_1.z.object({ id: zod_1.z.string() }),
    payload: zod_1.z.object({ values: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()) }),
    clientSnapshot: exports.clientSnapshotSchema.optional(),
});
exports.tabChangeEventSchema = zod_1.z.object({
    eventId: zod_1.z.string(),
    timestamp: zod_1.z.string(),
    type: zod_1.z.literal("tabs.change"),
    target: zod_1.z.object({ id: zod_1.z.string() }),
    payload: zod_1.z.object({
        previousTab: zod_1.z.string().optional(),
        nextTab: zod_1.z.string(),
    }),
    clientSnapshot: exports.clientSnapshotSchema.optional(),
});
exports.modalCloseEventSchema = zod_1.z.object({
    eventId: zod_1.z.string(),
    timestamp: zod_1.z.string(),
    type: zod_1.z.literal("modal.close"),
    target: zod_1.z.object({ id: zod_1.z.string(), closeIntent: zod_1.z.string().optional() }),
    clientSnapshot: exports.clientSnapshotSchema.optional(),
});
exports.runtimeCommandEventSchema = zod_1.z.object({
    eventId: zod_1.z.string(),
    timestamp: zod_1.z.string(),
    type: zod_1.z.literal("runtime.command"),
    command: zod_1.z.enum(["restart", "back_to_launcher", "inspect_state"]),
    clientSnapshot: exports.clientSnapshotSchema.optional(),
});
exports.timerRefreshEventSchema = zod_1.z.object({
    eventId: zod_1.z.string(),
    timestamp: zod_1.z.string(),
    type: zod_1.z.literal("timer.refresh"),
    timerId: zod_1.z.string(),
    appId: zod_1.z.string().optional(),
    appTitle: zod_1.z.string().optional(),
    appKind: zod_1.z.string().optional(),
});
exports.auirEventSchema = zod_1.z.discriminatedUnion("type", [
    exports.appSearchEventSchema,
    exports.componentClickEventSchema,
    exports.componentCommitEventSchema,
    exports.formSubmitEventSchema,
    exports.tabChangeEventSchema,
    exports.modalCloseEventSchema,
    exports.runtimeCommandEventSchema,
    exports.timerRefreshEventSchema,
]);
// -----------------------------------------------------------
// Session / App Descriptor
// -----------------------------------------------------------
exports.auirSessionSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    appId: zod_1.z.string().optional(),
    turn: zod_1.z.number(),
    pageLogId: zod_1.z.string().optional(),
    pageStartedAt: zod_1.z.string().optional(),
    initialQuery: zod_1.z.string().optional(),
});
exports.auirAppDescriptorSchema = zod_1.z.object({
    id: zod_1.z.string(),
    title: zod_1.z.string(),
    kind: zod_1.z.enum([
        "launcher",
        "utility",
        "engineering_tool",
        "creative_tool",
        "productivity_tool",
        "simulation",
        "dashboard",
        "unknown",
    ]),
    description: zod_1.z.string().optional(),
});
// -----------------------------------------------------------
// Memory Schemas
// -----------------------------------------------------------
exports.retrievedUserMemorySchema = zod_1.z.object({
    key: zod_1.z.string(),
    value: zod_1.z.unknown(),
    source: zod_1.z.enum(["explicit", "inferred", "system"]),
    confidence: zod_1.z.number().min(0).max(1),
    createdAt: zod_1.z.string().optional(),
    lastUsedAt: zod_1.z.string().optional(),
    sensitivity: zod_1.z.enum(["low", "medium", "high"]).optional(),
});
exports.auirMemorySchema = zod_1.z.object({
    turn: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    session: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    app: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    user: zod_1.z.array(exports.retrievedUserMemorySchema),
});
exports.jsonPatchOperationSchema = zod_1.z.object({
    op: zod_1.z.enum(["add", "replace", "remove"]),
    path: zod_1.z.string(),
    value: zod_1.z.unknown().optional(),
});
exports.userMemoryCandidateSchema = zod_1.z.object({
    key: zod_1.z.string(),
    value: zod_1.z.unknown(),
    reason: zod_1.z.string(),
    confidence: zod_1.z.number().min(0).max(1),
    source: zod_1.z.enum(["explicit", "inferred"]),
    requiresUserConsent: zod_1.z.boolean(),
});
exports.auirMemoryPatchSchema = zod_1.z.object({
    session: zod_1.z.array(exports.jsonPatchOperationSchema).optional(),
    app: zod_1.z.array(exports.jsonPatchOperationSchema).optional(),
    userCandidates: zod_1.z.array(exports.userMemoryCandidateSchema).optional(),
});
// -----------------------------------------------------------
// Tool Schemas
// -----------------------------------------------------------
exports.auirToolDescriptorSchema = zod_1.z.object({
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    inputSchema: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    outputTrustLevel: zod_1.z.enum(["real", "simulated", "estimated"]),
    requiresUserConfirmation: zod_1.z.boolean(),
});
exports.auirToolRequestSchema = zod_1.z.object({
    id: zod_1.z.string(),
    toolName: zod_1.z.string(),
    args: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    reason: zod_1.z.string(),
    requiresUserConfirmation: zod_1.z.boolean(),
});
// -----------------------------------------------------------
// Diagnostics Schema
// -----------------------------------------------------------
exports.auirDiagnosticsSchema = zod_1.z.object({
    eventInterpretedAs: zod_1.z.string().optional(),
    stateTransition: zod_1.z.string().optional(),
    simulatedData: zod_1.z.boolean().optional(),
    warnings: zod_1.z.array(zod_1.z.string()).optional(),
    modelUsed: zod_1.z.string().optional(),
    turnCount: zod_1.z.number().optional(),
    nodeCount: zod_1.z.number().optional(),
    errors: zod_1.z.array(zod_1.z.string()).optional(),
});
// -----------------------------------------------------------
// State Schema
// -----------------------------------------------------------
exports.auirStateSchema = zod_1.z.object({
    app: exports.auirAppDescriptorSchema,
    memory: zod_1.z.object({
        app: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
        session: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    }),
    ui: exports.uiNodeSchema,
});
// -----------------------------------------------------------
// Constraints Schema
// -----------------------------------------------------------
exports.auirConstraintsSchema = zod_1.z.object({
    renderMode: zod_1.z.literal("full_state"),
    allowedComponents: zod_1.z.array(zod_1.z.string()),
    maxNodes: zod_1.z.number(),
    maxDepth: zod_1.z.number(),
    maxTextLength: zod_1.z.number(),
    allowExternalData: zod_1.z.boolean(),
    allowCodeExecution: zod_1.z.boolean(),
    allowToolUse: zod_1.z.boolean(),
    styleSystem: zod_1.z.literal("semantic_tokens_only"),
    layoutPolicy: zod_1.z.object({
        allowMultiColumn: zod_1.z.boolean(),
        allowGrid: zod_1.z.boolean(),
        allowSplitView: zod_1.z.boolean(),
        maxGridColumns: zod_1.z.number(),
        maxRegions: zod_1.z.number(),
    }),
    interactionPolicy: zod_1.z.object({
        defaultInputMode: zod_1.z.enum(["local", "ai_transition"]),
        defaultButtonMode: zod_1.z.enum(["ai_transition", "local"]),
        requireClientSnapshotForAITransition: zod_1.z.boolean(),
        allowLocalActions: zod_1.z.boolean(),
        allowDebouncedAITransitions: zod_1.z.boolean(),
    }),
    transitionPolicy: zod_1.z.object({
        preferMinimalChange: zod_1.z.boolean(),
        preserveStableIds: zod_1.z.boolean(),
        preserveUserInputs: zod_1.z.boolean(),
        allowMajorRedesignOnlyOn: zod_1.z.array(zod_1.z.string()),
    }),
});
// -----------------------------------------------------------
// Top-Level Request / Response Schemas
// -----------------------------------------------------------
exports.auirRequestSchema = zod_1.z.object({
    protocol: zod_1.z.literal("AUIR"),
    version: zod_1.z.literal("0.3"),
    session: exports.auirSessionSchema,
    previous: exports.auirStateSchema.nullable(),
    event: exports.auirEventSchema,
    memory: exports.auirMemorySchema,
    constraints: exports.auirConstraintsSchema,
    availableTools: zod_1.z.array(exports.auirToolDescriptorSchema).optional(),
});
exports.auirResponseSchema = zod_1.z.object({
    protocol: zod_1.z.literal("AUIR"),
    version: zod_1.z.literal("0.3"),
    next: exports.auirStateSchema,
    memoryPatch: exports.auirMemoryPatchSchema.optional(),
    toolRequests: zod_1.z.array(exports.auirToolRequestSchema).optional(),
    diagnostics: exports.auirDiagnosticsSchema.optional(),
});
