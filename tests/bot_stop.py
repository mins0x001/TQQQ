"""🛡 손절 자동 매도(apply_stop) 점검: 1일차 검증 · 2일차(원장) · 거부 조건 · 평소 주문 정지 — bot_A·bot_T 동일 동작"""
import importlib.util, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
T, D1, D2, D3 = "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"
def plan(day=1, **kw):
    b = dict(rounds=24, max_rounds=24, avg_exact=100.0, last_close=79.0, sell_pct=10, per_split=1000, qty_unit=1)
    st = dict(day=day, sell_qty=5, next_qty=6, ref_price=79.0, ratio=0.8, rounds=24, total=24, since="2026-09-01")
    b.update(kw.pop("b", {})); st.update(kw.pop("st", {}))
    return {"bot": b, "stop": st, "holding_qty": 100, "orders": [{"side": "buy", "type": "LOC", "price": 1, "qty": 1}]}
acct = lambda **k: dict({"qty": 100.0, "sellable": 100.0, "avg": 100.0}, **k)
n = 0
for name in ["bot_A", "bot_T"]:
    spec = importlib.util.spec_from_file_location(name, root / "bot" / (name + ".py")); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    def run(p, a=None, ent=None, today=T, orders=None):
        c = m.Checks(); o, imm = m.apply_stop(p, "SOXL", a or acct(), orders if orders is not None else [{"side": "buy"}, {"side": "sell"}], ent, today, c)
        return o, imm, c
    # 1일차 정상: 평소 주문은 사라지고 MOC 손절 1건
    o, imm, c = run(plan()); assert len(o) == 1 and o[0]["stop"] and o[0]["qty"] == 5 and o[0]["side"] == "sell", o
    e = o[0]["stop_ent"]; assert e["n"] == 1 and e["date"] == T and e["next_qty"] == 6 and e["since"] == "2026-09-01"; n += 1
    # 1일차 거부: 손절선 위 · 분할 남음 · 비율 이상 · 수량 과다 · 매도가능 부족 · 앞선 검수 실패
    for lab, p, a in [("손절선 위", plan(b={"last_close": 81.0}), None), ("분할 남음", plan(b={"rounds": 20}), None),
                      ("비율 1.0", plan(st={"ratio": 1.0}), None), ("수량 41%", plan(st={"sell_qty": 41}), None),
                      ("매도가능 부족", plan(), acct(sellable=3.0)), ("수량 0", plan(st={"sell_qty": 0}), None),
                      ("자료 부족", plan(b={"avg_exact": None}), None)]:
        o, imm, c = run(p, a); assert not any(x.get("stop") for x in o) and o == [] and c.block_sell, (lab, o); n += 1
    c = m.Checks(); c.fail("V3 종가 불일치", "both")
    o, _ = m.apply_stop(plan(), "SOXL", acct(), [], None, T, c); assert not any(x.get("stop") for x in o) and len(c.block_sell) == 2; n += 1
    # 신호 없음 + 원장 없음 → 아무것도 안 건드림
    o, imm, c = run({"bot": {}, "stop": None}); assert o == [{"side": "buy"}, {"side": "sell"}] and imm is None; n += 1
    # 같은 사이클 재발동 금지 (끝난 원장) · 2일차인데 원장 없음 → 거부
    o, imm, c = run(plan(), ent={"since": "2026-09-01", "n": 2, "date": D1}, today=D3); assert o == [] and not any(x.get("stop") for x in o); n += 1
    o, imm, c = run(plan(day=2)); assert o == [] and c.block_sell; n += 1
    # 같은 날 재실행: 1일차 이미 처리 → 주문 없음(매수 정지 유지)
    ent1 = {"since": "2026-09-01", "n": 1, "date": T, "next_qty": 6}
    o, imm, c = run({"bot": {}, "stop": None}, ent=ent1, today=T); assert o == [] and imm is None; n += 1
    # 2일차: 날짜가 지나면 원장 수량으로 매도(앱 신호 없어도) · 보유 94주 기준
    o, imm, c = run({"bot": {}, "stop": None}, a=acct(qty=95.0, sellable=95.0), ent=ent1, today=D1)
    assert len(o) == 1 and o[0]["qty"] == 6 and o[0]["stop_ent"]["n"] == 2 and o[0]["stop_ent"]["date"] == D1, o; n += 1
    # 2일차 거부: 한도 초과 · 매도가능 부족 · 6일 초과 폐기(주문 없음, 원장 종료)
    o, imm, c = run({"bot": {}, "stop": None}, ent=dict(ent1, next_qty=45), today=D1); assert o == [] and c.block_sell; n += 1
    o, imm, c = run({"bot": {}, "stop": None}, a=acct(sellable=2.0), ent=ent1, today=D1); assert o == [] and c.block_sell; n += 1
    o, imm, c = run({"bot": {}, "stop": None}, ent=ent1, today="2026-11-20"); assert o == [{"side": "buy"}, {"side": "sell"}] and imm and imm["n"] == 2; n += 1
    # 2일차 수량 0 → 순서 종료
    o, imm, c = run({"bot": {}, "stop": None}, ent=dict(ent1, next_qty=0), today=D1); assert o == [] and imm["n"] == 2 and imm["date"] == D1; n += 1
    # 3일차: 순서 끝난 다음 날 → 평소 주문 그대로(정지 해제)
    o, imm, c = run({"bot": {}, "stop": None}, ent={"since": "2026-09-01", "n": 2, "date": D1}, today=D2); assert o == [{"side": "buy"}, {"side": "sell"}]; n += 1
    # 2일차 당일 재실행 → 평소 주문 정지 유지
    o, imm, c = run({"bot": {}, "stop": None}, ent={"since": "2026-09-01", "n": 2, "date": D1}, today=D1); assert o == []; n += 1
print(f"OK   bot 손절 매도: 2개 봇 × {n // 2}항목")
