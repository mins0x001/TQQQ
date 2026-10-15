#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
무한매수 로컬 실행기 — MUHAN-RUNNER V1.02 (261015)
Windows 11(작업 스케줄러) · Android(Termux + Ubuntu)에서 5분마다 `tick` 으로 실행됩니다.

  · 각 허브(무한매수 · 평생매수 · K무한매수)의 자동 실행 시각이 되면, 허브에 올라간 최신 앱(api.html)에서
    봇 코드를 꺼내 그대로 실행합니다 → 앱만 새 버전으로 올리면 PC·폰의 봇도 다음 실행 때 자동으로 최신.
  · 실행기 자신도 매 tick 마다 새 버전이 있으면 스스로 교체합니다.
  · GitHub 실행과 같이 돌아도 됩니다: 봇의 중복 주문 방지(V8) + 실행기 잠금(다른 실행기가 진행 중이면 건너뜀).
  · 자동 실행 시각은 앱에서 바꾸면 Gist(muhan-bot*.json)를 읽어 바로 따라갑니다.

명령: setup(처음 한 번 · 키 입력) · tick(5분마다 · 자동) · run <허브> [order|account] (지금 실행) · status
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

VERSION = "MUHAN-RUNNER V1.02 (261015)"
BASE = "https://mins0x001.github.io"
SELF_URL = BASE + "/TQQQ/runner/muhan_runner.py"
KST = ZoneInfo("Asia/Seoul")
HUBS = {
    "muhan": {"name": "무한매수", "page": BASE + "/TQQQ/api.html", "cfg": "muhan-bot.json", "kind": "us", "acct": "06:40"},
    "qld":   {"name": "평생매수", "page": BASE + "/QLD/api.html", "cfg": "muhan-bot-qld.json", "kind": "us", "acct": "06:40"},
    "kr":    {"name": "K무한매수", "page": BASE + "/K2X/api-kr.html", "cfg": "muhan-bot-kr.json", "kind": "kr", "order": "14:45", "acct": "16:12"},
}
HOME = Path(os.environ.get("MUHAN_HOME") or (Path.home() / "muhan"))
CONF, STATE, LOG = HOME / "runner.json", HOME / "state.json", HOME / "runner.log"
WINDOW_MIN = 20          # 설정 시각부터 20분 안에 tick 이 오면 실행 (PC가 잠깐 늦게 깨도 OK)
SYNC_DESC = "muhan-sync (무한매수 기록 동기화 · 지우지 마세요)"


def log(msg):
    line = f"[{dt.datetime.now(KST):%m-%d %H:%M:%S}] {msg}"
    print(line, flush=True)
    try:
        HOME.mkdir(parents=True, exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        if LOG.stat().st_size > 2_000_000:
            LOG.write_text(LOG.read_text(encoding="utf-8")[-500_000:], encoding="utf-8")
    except OSError:
        pass


def get(url, headers=None, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "muhan-runner", "Cache-Control": "no-cache", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8")


def jload(p, d):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return d


def jsave(p, obj):
    HOME.mkdir(parents=True, exist_ok=True)
    tmp = Path(str(p) + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)
    try:
        os.chmod(p, 0o600)
    except OSError:
        pass


# ───────────────────────── 자동 업데이트
def self_update():
    try:
        new = get(SELF_URL + "?t=" + str(int(time.time())))
    except Exception as e:  # noqa: BLE001
        log(f"실행기 업데이트 확인 실패(그대로 진행): {e}")
        return
    m = re.search(r'VERSION = "(MUHAN-RUNNER [^"]+)"', new)
    if m and m.group(1) != VERSION and "def tick(" in new:
        Path(__file__).write_text(new, encoding="utf-8")
        log(f"🔄 실행기 업데이트 {VERSION} → {m.group(1)} — 다시 시작")
        os.execv(sys.executable, [sys.executable, __file__] + sys.argv[1:])


def fetch_bot(hub_id):
    """허브의 최신 앱에서 봇 파일을 꺼낸다 (앱 = 봇의 원본). 실패하면 지난번 받은 봇을 쓴다."""
    h = HUBS[hub_id]
    d = HOME / "bots" / hub_id
    d.mkdir(parents=True, exist_ok=True)
    try:
        page = get(h["page"] + "?t=" + str(int(time.time())))
        i = page.index("const BOT_FILES = ")
        files = json.loads(page[i + 18:page.index("\n", i)].rstrip(";").replace("<\\/", "</"))
        for path, text in files:
            if path.endswith(".py"):
                (d / path).write_text(text, encoding="utf-8")
                return d / path, re.search(r'VERSION = "([^"]+)"', text).group(1)
    except Exception as e:  # noqa: BLE001
        log(f"  {h['name']} 최신 봇 받기 실패 → 지난 봇 사용: {e}")
    old = next(iter(sorted(d.glob("*.py"))), None)
    return (old, "이전 봇") if old else (None, "")


# ───────────────────────── 설정 (처음 한 번)
def setup():
    conf = jload(CONF, {})
    print(f"\n{VERSION} 설정 — 키는 이 기기({CONF})에만 저장됩니다. 빈칸 + Enter = 그대로 두기\n")
    tok = input("① GitHub 토큰 (허브 ☁️ 동기화에 쓰는 ghp_… · gist 권한): ").strip() or conf.get("github_token", "")
    conf["github_token"] = tok
    gid = conf.get("gist_id", "")
    try:
        for page in range(1, 4):
            lst = json.loads(get(f"https://api.github.com/gists?per_page=100&page={page}", {"Authorization": "Bearer " + tok}))
            hit = next((g for g in lst if g.get("description") == SYNC_DESC), None)
            if hit:
                gid = hit["id"]
                break
            if len(lst) < 100:
                break
        print(f"   ✅ 동기화 Gist {gid[:8]}… 찾음" if gid else "   ⚠ 동기화 Gist를 못 찾음 — 허브 앱 💾 백업 탭에서 동기화를 먼저 켜세요")
    except Exception as e:  # noqa: BLE001
        print(f"   ⚠ GitHub 확인 실패: {e}")
    conf["gist_id"] = gid
    conf.setdefault("hubs", {})
    for hid, h in HUBS.items():
        cur = conf["hubs"].get(hid, {})
        print(f"\n② {h['name']} — 메리츠 앱키 (이 허브를 이 기기에서 안 돌리려면 빈칸)")
        k = input("   App Key: ").strip() or cur.get("app_key", "")
        s = input("   App Secret: ").strip() or cur.get("app_secret", "")
        conf["hubs"][hid] = {"app_key": k, "app_secret": s, "on": bool(k and s)}
    print("\n③ 텔레그램 알림 (선택 · 앱 ④에서 쓴 봇과 같아도 됨)")
    conf["telegram_token"] = input("   봇 토큰: ").strip() or conf.get("telegram_token", "")
    conf["telegram_chat"] = input("   채팅 ID: ").strip() or conf.get("telegram_chat", "")
    jsave(CONF, conf)
    on = [HUBS[h]["name"] for h, v in conf["hubs"].items() if v.get("on")]
    print(f"\n✅ 저장 완료 · 이 기기에서 실행할 허브: {', '.join(on) or '없음'}\n   지금 확인: python muhan_runner.py status\n")


# ───────────────────────── 실행
def gist_files(conf):
    g = json.loads(get("https://api.github.com/gists/" + conf["gist_id"], {"Authorization": "Bearer " + conf["github_token"]}))
    return {k: (v.get("content") or "") for k, v in (g.get("files") or {}).items()}


def jobs_for(hid, cfg):
    h = HUBS[hid]
    out = []
    if cfg.get("installed_at"):
        out.append(("account", h["acct"]))
    if cfg.get("mode") == "live":
        t = h.get("order") or cfg.get("run_kst") or "00:10"
        out.append(("order", t))
    return out


def run_bot(hid, job, conf):
    h, hc = HUBS[hid], conf["hubs"][hid]
    bot, ver = fetch_bot(hid)
    if not bot:
        log(f"  {h['name']}: 봇 파일이 없습니다")
        return 9
    env = dict(os.environ, MERITZ_APP_KEY=hc["app_key"], MERITZ_APP_SECRET=hc["app_secret"], MUHAN_TOKEN=conf["github_token"],
               GIST_ID=conf["gist_id"], APP_BASE=h["page"].rsplit("/", 1)[0] + "/", RUN_MODE="account" if job == "account" else "config",
               RUN_TRIGGER="schedule", RUNNER_ID="local-" + socket.gethostname()[:20],
               TELEGRAM_BOT_TOKEN=conf.get("telegram_token", ""), TELEGRAM_CHAT_ID=conf.get("telegram_chat", ""), PYTHONIOENCODING="utf-8")
    log(f"▶ {h['name']} {job} 실행 · {ver}")
    try:
        r = subprocess.run([sys.executable, str(bot)], cwd=str(bot.parent), env=env, timeout=90 * 60,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        tail = (r.stdout or "")[-1500:] + (r.stderr or "")[-800:]
        with open(HOME / f"last_{hid}_{job}.log", "w", encoding="utf-8") as f:
            f.write((r.stdout or "") + "\n" + (r.stderr or ""))
        log(f"■ {h['name']} {job} 끝 (코드 {r.returncode}) · {tail.strip().splitlines()[-1][:120] if tail.strip() else ''}")
        return r.returncode
    except subprocess.TimeoutExpired:
        log(f"✖ {h['name']} {job} 90분 초과로 중단")
        return 8


def tick(force=None):
    self_update()
    conf = jload(CONF, {})
    if not conf.get("github_token") or not conf.get("gist_id"):
        log("설정 전입니다 — python muhan_runner.py setup")
        return
    try:
        files = gist_files(conf)
    except Exception as e:  # noqa: BLE001
        log(f"Gist 읽기 실패: {e}")
        return
    now = dt.datetime.now(KST)
    state = jload(STATE, {})
    for hid, hc in (conf.get("hubs") or {}).items():
        if not hc.get("on") or hid not in HUBS:
            continue
        try:
            cfg = json.loads(files.get(HUBS[hid]["cfg"]) or "{}")
        except ValueError:
            cfg = {}
        for job, hhmm in jobs_for(hid, cfg):
            if force and force != (hid, job):
                continue
            hh, mm = (int(x) for x in hhmm.split(":"))
            start = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
            key = f"{hid}:{job}:{start:%Y-%m-%d}:{hhmm}"
            due = force or (start <= now < start + dt.timedelta(minutes=WINDOW_MIN))
            if not due or (state.get(key) and not force):
                continue
            state[key] = now.isoformat(timespec="seconds")         # 먼저 표시 → 다음 tick 이 같은 일을 다시 시작하지 않음
            jsave(STATE, {k: v for k, v in state.items() if v >= (now - dt.timedelta(days=7)).isoformat()})
            run_bot(hid, job, conf)


def status():
    conf = jload(CONF, {})
    print(f"{VERSION} · 설정 {CONF}")
    print(f"  GitHub {'✅' if conf.get('github_token') else '❌'} · Gist {conf.get('gist_id', '')[:8] or '❌'} · 텔레그램 {'✅' if conf.get('telegram_token') else '-'}")
    try:
        files = gist_files(conf)
    except Exception as e:  # noqa: BLE001
        files = {}
        print(f"  ⚠ Gist 읽기 실패: {e}")
    for hid, h in HUBS.items():
        hc = (conf.get("hubs") or {}).get(hid, {})
        cfg = json.loads(files.get(h["cfg"]) or "{}") if files.get(h["cfg"]) else {}
        js = " · ".join(f"{j} {t}" for j, t in jobs_for(hid, cfg)) or "자동 실행 꺼짐"
        print(f"  {h['name']:6s} {'✅ 이 기기에서 실행' if hc.get('on') else '— 꺼짐'} · {js}")
    print("  최근 기록:")
    try:
        print("".join(LOG.read_text(encoding="utf-8").splitlines(keepends=True)[-8:]))
    except OSError:
        print("  (아직 없음)")


if __name__ == "__main__":
    a = sys.argv[1:] or ["status"]
    if a[0] == "setup":
        setup()
    elif a[0] == "tick":
        tick()
    elif a[0] == "run" and len(a) >= 2:
        tick(force=(a[1], a[2] if len(a) > 2 else "order"))
    else:
        status()
