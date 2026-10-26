"""수동 실행 한도 면제 점검: ⚡ 바로 실행(workflow_dispatch + 방금 쓴 manual_until)에서만 V7 면제 · 예약 실행·만료·미래값은 면제 안 함"""
import datetime as dt, importlib.util, os, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
now = dt.datetime.now(dt.timezone.utc)
iso = lambda m: (now + dt.timedelta(minutes=m)).isoformat().replace("+00:00", "Z")
for name in ["bot_A", "bot_B", "bot_C", "bot_T"]:
    spec = importlib.util.spec_from_file_location(name, root / "bot" / (name + ".py")); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    os.environ["GITHUB_EVENT_NAME"] = "workflow_dispatch"
    ok = m.manual_override({"manual_until": iso(5)}); assert ok, (name, "수동 + 유효")
    assert not m.manual_override({"manual_until": iso(-1)}), (name, "만료")
    assert not m.manual_override({"manual_until": iso(120)}), (name, "너무 먼 미래")
    assert not m.manual_override({}), (name, "표시 없음")
    assert not m.manual_override({"manual_until": "엉터리"}), (name, "형식 오류")
    os.environ["GITHUB_EVENT_NAME"] = "schedule"
    assert not m.manual_override({"manual_until": iso(5)}), (name, "예약 실행은 면제 금지")
    assert m.hard_cap({}) == 20000 and m.hard_cap({"max_order_usd": 5000}) == 5000
print("OK   bot 수동 한도 면제: 4개 봇 × 8항목")
