"""
AUIR Runtime — Comprehensive Test Suite
Tests multiple app types, event chains, and edge cases.
"""
import json
import sys
import urllib.request
import urllib.error
from typing import Any, Dict, List, Tuple

API_URL = "http://localhost:3000/api/ai-ui"
PASS = 0
FAIL = 0
RESULTS: List[Tuple[str, bool, str]] = []

BASE_CONSTRAINTS = {
    "renderMode": "full_state",
    "allowedComponents": [
        "screen", "container", "panel", "heading", "text", "button",
        "text_input", "number_input", "textarea", "select", "checkbox",
        "slider", "table", "metric", "alert", "tabs", "modal",
        "code_block", "chart_bar", "chart_line",
    ],
    "maxNodes": 80,
    "maxDepth": 8,
    "maxTextLength": 4000,
    "allowExternalData": False,
    "allowCodeExecution": False,
    "styleSystem": "semantic_tokens_only",
    "transitionPolicy": {
        "preferMinimalChange": True,
        "preserveStableIds": True,
        "preserveUserInputs": True,
        "allowMajorRedesignOnlyOn": ["app.search", "explicit_redesign_request"],
    },
}

def send_request(request: Dict) -> Dict:
    """Send an AUIR request and return the response."""
    data = json.dumps(request).encode("utf-8")
    req = urllib.request.Request(API_URL, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise Exception(f"HTTP {e.code}: {body}") from e


def validate_response(response: Dict) -> Tuple[bool, str]:
    """Validate the basic structure of an AUIR response."""
    checks = []
    if response.get("protocol") != "AUIR":
        checks.append("protocol != AUIR")
    if response.get("version") != "0.1":
        checks.append("version != 0.1")
    if not isinstance(response.get("next"), dict):
        checks.append("next is not an object")
    else:
        nxt = response["next"]
        if not isinstance(nxt.get("app"), dict):
            checks.append("next.app missing")
        else:
            app = nxt["app"]
            if not app.get("id"):
                checks.append("app.id missing")
            if not app.get("title"):
                checks.append("app.title missing")
        if not isinstance(nxt.get("ui"), dict):
            checks.append("next.ui missing")
        else:
            ui = nxt["ui"]
            if ui.get("type") != "screen":
                checks.append(f"ui.type != screen (got: {ui.get('type')})")
            if "children" not in ui:
                checks.append("ui.children missing")
    if checks:
        return False, "; ".join(checks)
    return True, "OK"


def count_nodes(node: Dict) -> int:
    """Count total nodes in a UI tree."""
    count = 1
    for child in node.get("children", []):
        count += count_nodes(child)
    return count


def record(test_name: str, passed: bool, detail: str = ""):
    global PASS, FAIL
    if passed:
        PASS += 1
        RESULTS.append((test_name, True, detail))
        print(f"  ✅ {test_name}: {detail}")
    else:
        FAIL += 1
        RESULTS.append((test_name, False, detail))
        print(f"  ❌ {test_name}: {detail}")


def make_request(event: Dict, session_id: str, turn: int, previous: Dict = None) -> Dict:
    return {
        "protocol": "AUIR",
        "version": "0.1",
        "session": {"sessionId": session_id, "appId": previous["next"]["app"]["id"] if previous else None, "turn": turn},
        "previous": previous,
        "event": event,
        "memory": {"turn": {}, "session": previous["next"]["memory"]["session"] if previous else {}, "app": previous["next"]["memory"]["app"] if previous else {}, "user": []},
        "constraints": BASE_CONSTRAINTS,
    }


def make_search_event(query: str) -> Dict:
    return {"eventId": "evt_0001", "timestamp": "2026-06-06T00:00:00Z", "type": "app.search", "query": query}


def make_click_event(node_id: str, intent: str) -> Dict:
    return {
        "eventId": "evt_0002", "timestamp": "2026-06-06T00:00:01Z",
        "type": "component.click",
        "target": {"id": node_id, "type": "button", "intent": intent},
    }


def make_value_change_event(node_id: str, binding: str, next_value: Any) -> Dict:
    return {
        "eventId": "evt_0003", "timestamp": "2026-06-06T00:00:02Z",
        "type": "component.value_change",
        "target": {"id": node_id, "type": "number_input", "binding": binding},
        "payload": {"previousValue": 12, "nextValue": next_value},
    }


# ============================================================
# TEST SUITE
# ============================================================

print("=" * 60)
print("AUIR Runtime — Comprehensive Test Suite")
print("=" * 60)

# --- Test 1: Rocket Engine Analyzer (baseline) ---
print("\n📋 Test 1: Rocket Engine Cycle Analyzer")
try:
    r1 = send_request(make_request(make_search_event("做一个火箭发动机循环参数分析工具"), "sess_rocket", 0))
    ok, msg = validate_response(r1)
    record("Rocket: Valid response", ok, msg)
    record("Rocket: App kind set", r1["next"]["app"]["kind"] in ["engineering_tool", "utility"], f"kind={r1['next']['app']['kind']}")
    n = count_nodes(r1["next"]["ui"])
    record("Rocket: UI has nodes", n > 5, f"{n} nodes")
    record("Rocket: Has inputs", any("number_input" in str(c) or "select" in str(c) for c in json.dumps(r1["next"]["ui"]["children"])), "")
    record("Rocket: simulatedData flag", r1.get("diagnostics", {}).get("simulatedData") == True, "")

    # Chain: Click "compare" button
    r2 = send_request(make_request(make_click_event("compare_btn", "compare_cycle_options"), "sess_rocket", 1, r1))
    ok2, _ = validate_response(r2)
    record("Rocket: Click compare → valid response", ok2)
    record("Rocket: View changed", r2["next"]["memory"]["session"].get("currentView") != r1["next"]["memory"]["session"].get("currentView", ""), "")

    # Chain: Click "back" button
    r3 = send_request(make_request(make_click_event("back_btn", "back_to_analyzer"), "sess_rocket", 2, r2))
    record("Rocket: Back to analyzer → valid", validate_response(r3)[0])

    # Chain: Value change
    r4 = send_request(make_request(make_value_change_event("chamber_pressure", "chamberPressureMPa", 15), "sess_rocket", 3, r3))
    ok4, _ = validate_response(r4)
    record("Rocket: Value change → valid", ok4)
    record("Rocket: Preserved inputs", r4["next"]["memory"]["app"].get("inputs", {}).get("chamberPressureMPa") == 15, "")
except Exception as e:
    record("Rocket: CRASH", False, str(e))


# --- Test 2: Financial Dashboard ---
print("\n📋 Test 2: Financial Dashboard")
try:
    r1 = send_request(make_request(make_search_event("build me a personal finance dashboard with budget tracking"), "sess_fin", 0))
    ok, msg = validate_response(r1)
    record("Finance: Valid response", ok, msg)
    n = count_nodes(r1["next"]["ui"])
    record("Finance: Has UI nodes", n > 3, f"{n} nodes")
except Exception as e:
    record("Finance: CRASH", False, str(e))


# --- Test 3: Project Management Tool ---
print("\n📋 Test 3: Project Management Tool")
try:
    r1 = send_request(make_request(make_search_event("create a kanban board for project management"), "sess_pm", 0))
    ok, msg = validate_response(r1)
    record("PM: Valid response", ok, msg)
    n = count_nodes(r1["next"]["ui"])
    record("PM: Has UI nodes", n > 3, f"{n} nodes")
except Exception as e:
    record("PM: CRASH", False, str(e))


# --- Test 4: Data Visualization / Weather ---
print("\n📋 Test 4: Data Visualization Tool")
try:
    r1 = send_request(make_request(make_search_event("weather forecast visualization with charts and metrics"), "sess_wx", 0))
    ok, msg = validate_response(r1)
    record("Weather: Valid response", ok, msg)
    n = count_nodes(r1["next"]["ui"])
    record("Weather: Has UI nodes", n > 3, f"{n} nodes")
except Exception as e:
    record("Weather: CRASH", False, str(e))


# --- Test 5: Simulation Tool ---
print("\n📋 Test 5: Physics Simulation")
try:
    r1 = send_request(make_request(make_search_event("create a pendulum physics simulator"), "sess_phys", 0))
    ok, msg = validate_response(r1)
    record("Physics: Valid response", ok, msg)
    n = count_nodes(r1["next"]["ui"])
    record("Physics: Has UI nodes", n > 2, f"{n} nodes")
except Exception as e:
    record("Physics: CRASH", False, str(e))


# --- Test 6: Edge Cases ---
print("\n📋 Test 6: Edge Cases")
# Empty query
try:
    r1 = send_request(make_request(make_search_event(""), "sess_edge1", 0))
    ok, msg = validate_response(r1)
    record("Edge: Empty query → valid", ok, msg or "empty query handled")
except Exception as e:
    record("Edge: Empty query → CRASH", False, str(e))

# Very long query
try:
    long_query = "build me " + "a very detailed " * 50 + "application"
    r1 = send_request(make_request(make_search_event(long_query[:2000]), "sess_edge2", 0))
    ok, msg = validate_response(r1)
    record("Edge: Long query → valid", ok, msg or "long query handled")
except Exception as e:
    record("Edge: Long query → CRASH", False, str(e))

# Chinese query
try:
    r1 = send_request(make_request(make_search_event("帮我做一个中文的计算器应用"), "sess_edge3", 0))
    ok, msg = validate_response(r1)
    record("Edge: Chinese query → valid", ok, msg or "chinese handled")
except Exception as e:
    record("Edge: Chinese query → CRASH", False, str(e))

# Rapid sequential requests (same session)
print("\n📋 Test 7: Rapid Sequential Events")
try:
    r1 = send_request(make_request(make_search_event("calculator"), "sess_rapid", 0))
    r2 = send_request(make_request(make_click_event("btn_7", "digit_7"), "sess_rapid", 1, r1))
    r3 = send_request(make_request(make_click_event("btn_plus", "operator_plus"), "sess_rapid", 2, r2))
    r4 = send_request(make_request(make_click_event("btn_3", "digit_3"), "sess_rapid", 3, r3))
    r5 = send_request(make_request(make_click_event("btn_equals", "operator_equals"), "sess_rapid", 4, r4))
    all_ok = all(validate_response(r)[0] for r in [r1, r2, r3, r4, r5])
    record("Rapid: 5 sequential events", all_ok)
except Exception as e:
    record("Rapid: CRASH", False, str(e))


# --- Test 8: Restart ---
print("\n📋 Test 8: Restart Runtime")
try:
    r1 = send_request(make_request(make_search_event("calculator"), "sess_restart", 0))
    r2 = send_request(make_request(make_click_event("restart_btn", "restart_runtime"), "sess_restart", 1, r1))
    ok, _ = validate_response(r2)
    record("Restart: Valid response", ok)
    # After restart, should show launcher again
    ui_nodes = count_nodes(r2["next"]["ui"])
    record("Restart: Reverted to launcher", ui_nodes < 10, f"{ui_nodes} nodes (likely launcher)")
except Exception as e:
    record("Restart: CRASH", False, str(e))


# ============================================================
# SUMMARY
# ============================================================
print("\n" + "=" * 60)
print("TEST SUMMARY")
print("=" * 60)
total = PASS + FAIL
print(f"Total: {total} | ✅ Passed: {PASS} | ❌ Failed: {FAIL}")
if FAIL > 0:
    print(f"\nFailed tests:")
    for name, passed, detail in RESULTS:
        if not passed:
            print(f"  ❌ {name}: {detail}")

print(f"\nPass rate: {PASS}/{total} = {PASS/total*100:.1f}%" if total > 0 else "No tests run")
sys.exit(0 if FAIL == 0 else 1)
