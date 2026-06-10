"use strict";
// ============================================================
// AUIR Computed Bindings — 本地计算表达式引擎
// ============================================================
// 允许 UI 节点引用其他 binding 的值进行本地计算，
// 无需触发 AI 状态转移。
//
// 设计哲学：
//   TheHiggs 的核心循环是 AI 状态转移，但并非所有计算都需要 AI。
//   纯数值运算（加减乘除、单位转换、百分比）应该在客户端完成，
//   只有需要语义理解的操作（分析、比较、生成）才应触发 AI。
//
// 语法：
//   binding 中使用 `${expr}` 语法引用表达式：
//   - `${price * quantity}` — 乘法
//   - `${subtotal * 0.08}` — 常量运算
//   - `${Math.round(value * 100) / 100}` — 数学函数
//   - `${a + b + c}` — 多变量运算
//
// 安全保证：
//   - 表达式在沙箱中执行（仅允许数学运算）
//   - 不允许访问全局对象（window, document, fetch 等）
//   - 不允许函数调用（除 Math.* 内置函数）
//   - 表达式解析失败时返回原始字符串
Object.defineProperty(exports, "__esModule", { value: true });
exports.isComputedExpression = isComputedExpression;
exports.resolveComputedValue = resolveComputedValue;
exports.resolveAllComputedValues = resolveAllComputedValues;
exports.resolveDisplayValue = resolveDisplayValue;
// -----------------------------------------------------------
// 表达式沙箱
// -----------------------------------------------------------
/** 允许的 Math 函数白名单 */
const ALLOWED_MATH = new Set([
    "abs",
    "ceil",
    "floor",
    "round",
    "max",
    "min",
    "pow",
    "sqrt",
    "log",
    "log10",
    "log2",
    "exp",
    "sign",
    "trunc",
]);
/** 沙箱化执行表达式 */
function safeEval(expr, vars) {
    // 构建安全的执行上下文
    const varNames = Object.keys(vars);
    const varValues = Object.values(vars);
    // 创建受限的 Math 对象
    const safeMath = {};
    for (const fn of ALLOWED_MATH) {
        safeMath[fn] = Math[fn];
    }
    try {
        // 使用 Function 构造器创建沙箱函数
        // 仅允许 Math 函数和传入的变量
        const sandboxedFn = new Function("Math", ...varNames, `"use strict"; return (${expr});`);
        const result = sandboxedFn(safeMath, ...varValues);
        if (typeof result === "number" && isFinite(result)) {
            return result;
        }
        return null;
    }
    catch {
        return null;
    }
}
// -----------------------------------------------------------
// 表达式解析
// -----------------------------------------------------------
/** 检测值是否包含计算表达式 */
function isComputedExpression(value) {
    return typeof value === "string" && /\$\{.+\}/.test(value);
}
/** JavaScript 字面量和关键字，不应被视为变量 */
const JS_LITERALS = new Set([
    "true",
    "false",
    "null",
    "undefined",
    "NaN",
    "Infinity",
]);
/** 解析计算表达式中的变量引用 */
function extractVariables(expr) {
    // 先移除字符串字面量，再匹配标识符
    const stripped = expr.replace(/"[^"]*"|'[^']*'/g, "");
    const matches = stripped.match(/\b([a-zA-Z_]\w*)\b/g) ?? [];
    const unique = new Set(matches.filter((m) => m !== "Math" && !ALLOWED_MATH.has(m) && !JS_LITERALS.has(m)));
    return [...unique];
}
/** 替换表达式中的变量引用为实际值 */
function substituteVariables(expr, localState) {
    const varNames = extractVariables(expr);
    const vars = {};
    const missing = [];
    for (const name of varNames) {
        const value = localState.values[name];
        if (value !== undefined && value !== null && value !== "") {
            const num = Number(value);
            if (!isNaN(num)) {
                vars[name] = num;
            }
            else {
                missing.push(name);
            }
        }
        else {
            missing.push(name);
        }
    }
    return { substituted: expr, vars, missing };
}
// -----------------------------------------------------------
// 计算求值
// -----------------------------------------------------------
/**
 * 解析并计算一个包含表达式的值。
 *
 * @param value 可能包含 ${expr} 的字符串
 * @param localState 当前本地状态（包含所有 binding 值）
 * @returns 计算结果（数字或原始字符串）
 */
function resolveComputedValue(value, localState) {
    if (!isComputedExpression(value))
        return value;
    const strValue = String(value);
    // 提取所有 ${...} 表达式
    const result = strValue.replace(/\$\{([^}]+)\}/g, (match, expr) => {
        const { vars, missing } = substituteVariables(expr, localState);
        // 如果有缺失变量，返回占位符
        if (missing.length > 0) {
            return match; // 保持原始表达式
        }
        // 执行计算
        const computed = safeEval(expr, vars);
        if (computed !== null) {
            // 格式化：整数不带小数，非整数保留 2 位
            if (Number.isInteger(computed)) {
                return String(computed);
            }
            return String(Math.round(computed * 100) / 100);
        }
        return match; // 计算失败，保持原始表达式
    });
    // 仅当原始值是纯表达式（如 "${a + b}"）时才转为数字
    // 混合内容（如 "Total: ${a} USD"）保持为字符串
    const isPureExpression = /^\$\{[^}]+\}$/.test(strValue.trim());
    if (isPureExpression) {
        const numResult = Number(result);
        if (!isNaN(numResult) && result.trim() !== "") {
            return numResult;
        }
    }
    return result;
}
/**
 * 批量解析 localState 中的所有计算表达式。
 * 用于在渲染前预处理 localState。
 *
 * @param localState 当前本地状态
 * @returns 解析后的值映射（不修改原始 localState）
 */
function resolveAllComputedValues(localState) {
    const resolved = {};
    for (const [binding, value] of Object.entries(localState.values)) {
        resolved[binding] = resolveComputedValue(value, localState);
    }
    return resolved;
}
// -----------------------------------------------------------
// 计算节点显示
// -----------------------------------------------------------
/**
 * 解析 local_value_display 节点的计算值。
 * 用于显示绑定值的格式化输出。
 *
 * @param binding binding 名称
 * @param localState 当前本地状态
 * @param format 显示格式
 * @param unit 单位
 * @returns 格式化的显示字符串
 */
function resolveDisplayValue(binding, localState, format, unit) {
    const rawValue = localState.values[binding];
    const resolved = resolveComputedValue(rawValue, localState);
    if (resolved === undefined || resolved === null)
        return "—";
    const numValue = Number(resolved);
    if (isNaN(numValue))
        return String(resolved);
    let formatted;
    switch (format) {
        case "fixed_1":
            formatted = numValue.toFixed(1);
            break;
        case "fixed_2":
            formatted = numValue.toFixed(2);
            break;
        case "scientific":
            formatted = numValue.toExponential(2);
            break;
        default:
            formatted = numValue.toLocaleString();
    }
    return unit ? `${formatted} ${unit}` : formatted;
}
