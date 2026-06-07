/**
 * 测试 repairAIResponse 逻辑
 * 验证能自动修复用户日志中的所有错误类型
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// 内联 repair 逻辑（避免 @/ 路径问题）

const VALID_SEMANTIC_ROLES = new Set([
  "navigation",
  "input",
  "analysis_action",
  "local_adjustment",
  "display",
  "warning",
  "confirmation",
  "tool_result",
  "simulation_result",
  "digit",
  "operator",
  "clear",
  "calculate",
  "scientific_function",
  "memory_operation",
  "edit",
  "toggle",
  "submit",
]);

const VALID_TONES = new Set([
  "default",
  "muted",
  "primary",
  "success",
  "warning",
  "danger",
  "accent",
]);

const VALID_LOCAL_ACTION_TYPES = new Set([
  "increment",
  "decrement",
  "set_value",
  "toggle",
  "append_text",
]);

function repairNodeTree(node) {
  if (!node || typeof node !== "object") return;
  const obj = node;

  if ("semanticRole" in obj && typeof obj.semanticRole === "string") {
    if (!VALID_SEMANTIC_ROLES.has(obj.semanticRole)) {
      delete obj.semanticRole;
    }
  }

  if ("style" in obj && typeof obj.style === "object" && obj.style !== null) {
    const style = obj.style;
    if ("tone" in style && typeof style.tone === "string") {
      if (!VALID_TONES.has(style.tone)) {
        delete style.tone;
      }
    }
  }

  if (
    "localAction" in obj &&
    typeof obj.localAction === "object" &&
    obj.localAction !== null
  ) {
    const la = obj.localAction;
    if ("type" in la && typeof la.type === "string") {
      if (!VALID_LOCAL_ACTION_TYPES.has(la.type)) {
        delete obj.localAction;
      }
    }
  }

  if ("layout" in obj && typeof obj.layout === "string") {
    delete obj.layout;
  }

  if (obj.type === "drawer") {
    if (!obj.side || typeof obj.side !== "string") obj.side = "right";
    if (!obj.closeIntent || typeof obj.closeIntent !== "string")
      obj.closeIntent = "close_drawer";
  }

  if ("children" in obj && Array.isArray(obj.children)) {
    for (const child of obj.children) repairNodeTree(child);
  }
  if ("primary" in obj) repairNodeTree(obj.primary);
  if ("secondary" in obj) repairNodeTree(obj.secondary);
  if ("tabs" in obj && Array.isArray(obj.tabs)) {
    for (const tab of obj.tabs) {
      if (
        tab &&
        typeof tab === "object" &&
        "children" in tab &&
        Array.isArray(tab.children)
      ) {
        for (const child of tab.children) repairNodeTree(child);
      }
    }
  }
}

describe("repairNodeTree", () => {
  it("removes invalid semanticRole values", () => {
    const node = {
      id: "btn",
      type: "button",
      label: "MC",
      intent: "mc",
      semanticRole: "memory_clear",
    };
    repairNodeTree(node);
    assert.equal(node.semanticRole, undefined);
  });

  it("keeps valid semanticRole values", () => {
    const node = {
      id: "btn",
      type: "button",
      label: "1",
      intent: "digit_1",
      semanticRole: "digit",
    };
    repairNodeTree(node);
    assert.equal(node.semanticRole, "digit");
  });

  it("removes invalid localAction.type", () => {
    const node = {
      id: "btn",
      type: "button",
      label: "MC",
      intent: "mc",
      localAction: { type: "memory_clear", binding: "memory" },
    };
    repairNodeTree(node);
    assert.equal(node.localAction, undefined);
  });

  it("keeps valid localAction.type", () => {
    const node = {
      id: "btn",
      type: "button",
      label: "+1",
      intent: "inc",
      localAction: { type: "increment", binding: "count" },
    };
    repairNodeTree(node);
    assert.deepEqual(node.localAction, { type: "increment", binding: "count" });
  });

  it("removes invalid style.tone", () => {
    const node = {
      id: "btn",
      type: "button",
      label: "=",
      intent: "calc",
      style: { tone: "highlight" },
    };
    repairNodeTree(node);
    assert.equal(node.style.tone, undefined);
  });

  it("keeps valid style.tone (including accent)", () => {
    const node = {
      id: "btn",
      type: "button",
      label: "=",
      intent: "calc",
      style: { tone: "accent" },
    };
    repairNodeTree(node);
    assert.equal(node.style.tone, "accent");
  });

  it("removes string layout", () => {
    const node = {
      id: "c",
      type: "container",
      direction: "row",
      layout: "flex-row gap-2",
      children: [],
    };
    repairNodeTree(node);
    assert.equal(node.layout, undefined);
  });

  it("keeps object layout", () => {
    const layout = { width: "full", align: "center" };
    const node = {
      id: "c",
      type: "container",
      direction: "row",
      layout,
      children: [],
    };
    repairNodeTree(node);
    assert.deepEqual(node.layout, layout);
  });

  it("fixes drawer missing side and closeIntent", () => {
    const node = {
      id: "d",
      type: "drawer",
      title: "History",
      children: [{ id: "t", type: "text", content: "hi" }],
    };
    repairNodeTree(node);
    assert.equal(node.side, "right");
    assert.equal(node.closeIntent, "close_drawer");
  });

  it("keeps existing drawer side and closeIntent", () => {
    const node = {
      id: "d",
      type: "drawer",
      title: "Nav",
      side: "left",
      closeIntent: "nav_close",
      children: [],
    };
    repairNodeTree(node);
    assert.equal(node.side, "left");
    assert.equal(node.closeIntent, "nav_close");
  });

  it("recursively repairs nested children", () => {
    const node = {
      id: "screen",
      type: "screen",
      title: "Test",
      children: [
        {
          id: "container",
          type: "container",
          direction: "row",
          layout: "bad-string",
          children: [
            {
              id: "btn1",
              type: "button",
              label: "A",
              intent: "a",
              semanticRole: "operator",
            },
            {
              id: "btn2",
              type: "button",
              label: "B",
              intent: "b",
              semanticRole: "nonexistent_role",
            },
          ],
        },
      ],
    };
    repairNodeTree(node);
    assert.equal(node.children[0].layout, undefined);
    assert.equal(node.children[0].children[0].semanticRole, "operator");
    assert.equal(node.children[0].children[1].semanticRole, undefined);
  });

  it("handles the full calculator error case from user log", () => {
    const node = {
      id: "screen_1",
      type: "screen",
      title: "Calculator",
      children: [
        { id: "display", type: "text", content: "0" },
        {
          id: "mem",
          type: "container",
          direction: "row",
          layout: "flex-row",
          children: [
            {
              id: "mc",
              type: "button",
              label: "MC",
              intent: "mc",
              semanticRole: "memory_clear",
              localAction: { type: "memory_clear" },
            },
            {
              id: "mr",
              type: "button",
              label: "MR",
              intent: "mr",
              semanticRole: "memory_recall",
              localAction: { type: "memory_recall" },
            },
          ],
        },
        {
          id: "sci",
          type: "container",
          direction: "row",
          layout: "flex-row",
          children: [
            {
              id: "sin",
              type: "button",
              label: "sin",
              intent: "sin",
              semanticRole: "scientific_function",
              localAction: { type: "apply_function" },
            },
            {
              id: "div",
              type: "button",
              label: "÷",
              intent: "div",
              semanticRole: "operator",
              localAction: { type: "append_operator" },
            },
          ],
        },
        {
          id: "digits",
          type: "container",
          direction: "grid",
          layout: "grid-4",
          children: [
            {
              id: "7",
              type: "button",
              label: "7",
              intent: "7",
              semanticRole: "digit",
              localAction: { type: "append_digit" },
            },
            {
              id: "8",
              type: "button",
              label: "8",
              intent: "8",
              semanticRole: "digit",
              localAction: { type: "append_digit" },
            },
            {
              id: "eq",
              type: "button",
              label: "=",
              intent: "calc",
              semanticRole: "calculate",
              localAction: { type: "evaluate" },
              style: { tone: "accent" },
            },
          ],
        },
        {
          id: "toggle",
          type: "button",
          label: "DEG",
          intent: "toggle",
          semanticRole: "toggle",
          localAction: { type: "cycle_mode" },
        },
        {
          id: "drawer",
          type: "drawer",
          title: "History",
          children: [
            {
              id: "clear_h",
              type: "button",
              label: "Clear",
              intent: "clear",
              semanticRole: "danger",
              localAction: { type: "clear_all" },
            },
          ],
        },
      ],
    };

    repairNodeTree(node);

    // string layouts removed
    assert.equal(node.children[1].layout, undefined);
    assert.equal(node.children[2].layout, undefined);
    assert.equal(node.children[3].layout, undefined);

    // valid semanticRoles kept
    assert.equal(node.children[3].children[0].semanticRole, "digit");
    assert.equal(node.children[3].children[2].semanticRole, "calculate");
    assert.equal(node.children[4].semanticRole, "toggle");
    assert.equal(node.children[3].children[2].style.tone, "accent");

    // invalid semanticRoles removed
    assert.equal(node.children[1].children[0].semanticRole, undefined); // memory_clear
    assert.equal(node.children[5].children[0].semanticRole, undefined); // danger

    // invalid localAction types removed
    assert.equal(node.children[1].children[0].localAction, undefined); // memory_clear
    assert.equal(node.children[2].children[0].localAction, undefined); // apply_function
    assert.equal(node.children[3].children[0].localAction, undefined); // append_digit
    assert.equal(node.children[4].localAction, undefined); // cycle_mode
    assert.equal(node.children[5].children[0].localAction, undefined); // clear_all

    // drawer defaults filled
    assert.equal(node.children[5].side, "right");
    assert.equal(node.children[5].closeIntent, "close_drawer");
  });
});
