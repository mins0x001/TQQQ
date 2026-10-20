/* 무한매수 로그인 V1.00 (261020)
   · 아이디마다 GitHub 토큰·Gist(=서버 저장소)를 따로 → 기록·설정·봇은 모두 아이디별 Gist 가 메인, 기기는 임시 캐시
   · 비밀번호는 어디에도 저장하지 않음: PBKDF2-SHA256 60만 회 → AES-GCM-256 으로 각자 정보를 잠금 (관리자도 볼 수 없음 · 초기화만)
   · auth/users.json(공개 저장소)에는 아이디 해시 + 암호문만 · 관리자 금고(전체 목록)는 무작위 키 K 로 잠그고 K 는 관리자 비밀번호로만 열림
   · B 방식(내 GitHub 안에) → A 방식(각자 GitHub) 전환: 사용자 항목의 토큰·Gist 만 바꾸면 끝 (앱·봇 구조 동일) */
const AUTH = { owner: "mins0x001", repo: "TQQQ", path: "auth/users.json", iter: 600000, ver: "V1.00" };
const A$ = {
  enc: new TextEncoder(), dec: new TextDecoder(),
  b64: u => { const a = new Uint8Array(u); let s = ""; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); },
  ub64: s => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
  rnd: n => crypto.getRandomValues(new Uint8Array(n)),
  esc: s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  ls: (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } },
  async idh(id) { const h = await crypto.subtle.digest("SHA-256", A$.enc.encode("muhan-id:" + String(id).trim().toLowerCase())); return [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join(""); },
  async pwKey(pw, salt, it) { const b = await crypto.subtle.importKey("raw", A$.enc.encode(pw), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: it, hash: "SHA-256" }, b, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); },
  rawKey: raw => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]),
  async seal(key, obj) { const iv = A$.rnd(12); return { iv: A$.b64(iv), ct: A$.b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, A$.enc.encode(JSON.stringify(obj)))) }; },
  async open(key, box) { return JSON.parse(A$.dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: A$.ub64(box.iv) }, key, A$.ub64(box.ct)))); },
  async sealPw(pw, obj) { const s = A$.rnd(16); return Object.assign({ s: A$.b64(s), it: AUTH.iter }, await A$.seal(await A$.pwKey(pw, s, AUTH.iter), obj)); },
  async openPw(pw, box) { return A$.open(await A$.pwKey(pw, A$.ub64(box.s), box.it || AUTH.iter), box); },
  pwOk: pw => pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw),
  tempPw() { const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; let p; do { p = [...A$.rnd(12)].map(b => c[b % c.length]).join(""); } while (!A$.pwOk(p)); return p; },
  idOk: id => /^[a-z0-9_-]{3,20}$/.test(id),
  async gh(path, opt, token) { opt = opt || {}; const r = await fetch("https://api.github.com" + path, { method: opt.method || "GET", cache: "no-store",
      headers: Object.assign({ Authorization: "Bearer " + (token || A$.ls("muhansync_token")), Accept: "application/vnd.github+json" }, opt.body ? { "Content-Type": "application/json" } : {}), body: opt.body ? JSON.stringify(opt.body) : undefined });
    if (r.status === 404 && opt.soft) return null; if (!r.ok) { const e = new Error("GitHub " + r.status); e.status = r.status; throw e; } return r.status === 204 ? {} : r.json(); },
  async dbPublic() { const r = await fetch(AUTH.path + "?t=" + Date.now(), { cache: "no-store" }).catch(() => null); return r && r.ok ? r.json() : null; },
  async dbApi(token) { const f = await A$.gh(`/repos/${AUTH.owner}/${AUTH.repo}/contents/${AUTH.path}`, { soft: true }, token); return f ? { db: JSON.parse(A$.dec.decode(A$.ub64(f.content.replace(/\n/g, "")))), sha: f.sha } : { db: null, sha: null }; },
  async dbPut(db, sha, msg, token) { db.updated = new Date().toISOString(); const body = { message: msg, content: A$.b64(A$.enc.encode(JSON.stringify(db, null, 1))) }; if (sha) body.sha = sha;
    return A$.gh(`/repos/${AUTH.owner}/${AUTH.repo}/contents/${AUTH.path}`, { method: "PUT", body }, token); },
  /* 세션: 다른 아이디로 바뀌면 기기 캐시 전부 비움(서버 Gist 에서 다시 받음) → 아이디끼리 기록이 섞이지 않음 */
  apply(p, auto) {
    let a = null; try { a = JSON.parse(A$.ls("muhan_auth") || "null"); } catch (e) {}
    const cur = A$.ls("muhansync_gist");
    if ((a && a.uid !== p.id) || (!a && cur && cur !== p.gist)) { try { localStorage.clear(); } catch (e) {} }
    A$.ls("muhansync_token", p.token); A$.ls("muhansync_gist", p.gist);
    A$.ls("muhan_auth", JSON.stringify({ uid: p.id, name: p.name || p.id, admin: !!p.admin, mode: p.mode || "B", auto: !!auto, at: Date.now() }));
    try { sessionStorage.setItem("muhan_sess", "1"); } catch (e) {}
  },
  me() { try { return JSON.parse(A$.ls("muhan_auth") || "null"); } catch (e) { return null; } },
  logout() { if (!confirm("로그아웃할까요?\n이 기기의 임시 저장값을 지웁니다 (기록·설정은 서버에 그대로).")) return; try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} location.reload(); },
};

/* 🔐 시작 화면: 로그인 · (처음 한 번) 관리자 만들기 · 자동 로그인 */
async function AUTHGATE(onReady) {
  const a = A$.me(), sess = (() => { try { return sessionStorage.getItem("muhan_sess"); } catch (e) { return null; } })();
  if (a && A$.ls("muhansync_token") && (a.auto || sess)) { authBar(a); onReady && onReady(a); return; }
  if (a && !a.auto) { A$.ls("muhansync_token", null); }                       // 자동 로그인 꺼짐 + 새 세션 → 다시 로그인
  const css = `.ag{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:radial-gradient(120% 80% at 50% 0%,#14213D 0%,#070B16 70%);font-family:inherit;}
    .ag .bx{width:100%;max-width:360px;padding:26px 22px;border-radius:22px;background:rgba(17,26,46,.92);border:1px solid #24345A;box-shadow:0 20px 60px rgba(0,0,0,.5);color:#E6EDF7;}
    .ag h2{margin:0 0 4px;font-size:22px;font-weight:900;letter-spacing:-.3px;} .ag p{margin:0 0 16px;font-size:12.5px;color:#8E9AB0;line-height:1.6;}
    .ag input[type=text],.ag input[type=password]{width:100%;box-sizing:border-box;margin:0 0 10px;padding:13px 14px;border-radius:12px;border:1px solid #2A3A60;background:#0B1224;color:#E6EDF7;font-size:15px;outline:none;}
    .ag input:focus{border-color:#5EEAD4;} .ag label{display:flex;align-items:center;gap:8px;margin:2px 0 14px;font-size:13px;color:#B7C2D6;}
    .ag button{width:100%;padding:13px;border:0;border-radius:12px;background:linear-gradient(90deg,#5EEAD4,#38BDF8);color:#04121C;font-size:15px;font-weight:900;cursor:pointer;} .ag button:disabled{opacity:.6;}
    .ag .er{min-height:18px;margin-top:10px;font-size:12.5px;color:#FF8A8A;text-align:center;} .ag .ft{margin-top:14px;font-size:11px;color:#5F6B82;text-align:center;}`;
  const db = await A$.dbPublic(), boot = !db || !db.users || !Object.keys(db.users).length;
  const el = document.createElement("div"); el.className = "ag";
  el.innerHTML = `<style>${css}</style><form class="bx" autocomplete="on">
    <h2>${boot ? "🛡 관리자 계정 만들기" : "🔐 무한매수 로그인"}</h2>
    <p>${boot ? "처음 한 번만 — 지금 이 기기에 연결된 GitHub 토큰·Gist 로 관리자 계정을 만듭니다. 비밀번호는 어디에도 저장되지 않으니 꼭 기억하세요." : "아이디마다 계좌·기록·봇이 따로 저장됩니다."}</p>
    <input type="text" id="agId" placeholder="아이디 (영문 소문자·숫자 3~20자)" autocomplete="username" autocapitalize="none" spellcheck="false" required>
    <input type="password" id="agPw" placeholder="비밀번호" autocomplete="${boot ? "new-password" : "current-password"}" required>
    ${boot ? `<input type="password" id="agPw2" placeholder="비밀번호 확인 (8자 이상 · 영문+숫자)" autocomplete="new-password" required>
      <input type="password" id="agTok" placeholder="GitHub 토큰" value="${A$.esc(A$.ls("muhansync_token") || "")}" autocomplete="off">
      <input type="text" id="agGist" placeholder="동기화 Gist ID" value="${A$.esc(A$.ls("muhansync_gist") || "")}" autocomplete="off" spellcheck="false">` : ""}
    <label><input type="checkbox" id="agAuto" checked> 자동 로그인 (이 기기)</label>
    <button type="submit" id="agGo">${boot ? "관리자 만들고 시작" : "로그인"}</button><div class="er" id="agEr"></div>
    <div class="ft">🔒 비밀번호는 저장되지 않습니다 · 분실 시 관리자가 초기화 · 로그인 ${AUTH.ver}</div></form>`;
  document.body.appendChild(el); document.documentElement.style.overflow = "hidden";
  const $ = id => el.querySelector("#" + id), er = t => { $("agEr").textContent = t; };
  let fails = 0;
  el.querySelector("form").onsubmit = async ev => {
    ev.preventDefault(); const id = $("agId").value.trim().toLowerCase(), pw = $("agPw").value, auto = $("agAuto").checked; er(""); $("agGo").disabled = true;
    try {
      if (boot) {
        if (!A$.idOk(id)) throw new Error("아이디는 영문 소문자·숫자·_- 3~20자");
        if (!A$.pwOk(pw)) throw new Error("비밀번호는 8자 이상 · 영문+숫자");
        if (pw !== $("agPw2").value) throw new Error("비밀번호 확인이 다릅니다");
        const token = $("agTok").value.trim(), gist = $("agGist").value.trim();
        if (!token || !gist) throw new Error("토큰과 Gist ID 가 필요합니다 (통합 앱 🛠설정에서 먼저 연결)");
        await A$.gh("/gists/" + gist, {}, token);                                          // 토큰·Gist 확인
        const { db: cur, sha } = await A$.dbApi(token); if (cur && cur.users && Object.keys(cur.users).length) throw new Error("이미 관리자가 있습니다 — 새로고침 후 로그인");
        const K = A$.rnd(32), kk = await A$.rawKey(K), h = await A$.idh(id), me = { id, name: id, token, gist, admin: true, mode: "B", created: new Date().toISOString() };
        const ndb = { v: 1, users: { [h]: await A$.sealPw(pw, me) }, wraps: { [h]: await A$.sealPw(pw, { k: A$.b64(K) }) }, vault: await A$.seal(kk, { users: { [id]: me } }) };
        await A$.dbPut(ndb, sha, "auth: 관리자 생성", token);
        A$.apply(me, auto);
      } else {
        const box = db.users[await A$.idh(id)]; let p = null;
        if (box) { try { p = await A$.openPw(pw, box); } catch (e) {} }
        if (!p) { fails++; await new Promise(r => setTimeout(r, Math.min(8000, 800 * fails))); throw new Error("아이디 또는 비밀번호가 맞지 않습니다"); }
        A$.apply(p, auto);
      }
      location.reload();
    } catch (e) { er("⚠ " + (e.status === 401 ? "토큰이 맞지 않습니다" : e.status === 404 ? "Gist 를 찾을 수 없습니다" : e.message)); $("agGo").disabled = false; }
  };
  setTimeout(() => $("agId").focus(), 50);
}

/* 상단 사용자 표시: 👤 이름 · 🔑 비밀번호 변경 · 🛡 관리자 · 로그아웃 */
function authBar(a) {
  const b = document.createElement("div");
  b.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-end;margin:0 0 8px;font-size:12px;";
  const pill = "padding:4px 10px;border-radius:99px;border:1px solid #2F4A7A;background:none;color:#B7C2D6;font-size:12px;font-weight:700;cursor:pointer;text-decoration:none;";
  b.innerHTML = `<span style="${pill}cursor:default;color:#5EEAD4;border-color:rgba(94,234,212,.4);">👤 ${A$.esc(a.name)}${a.admin ? " · 관리자" : ""}</span>`
    + (a.admin ? `<a style="${pill}" href="admin.html">🛡 사용자 관리</a>` : "") + `<button type="button" style="${pill}" id="abPw">🔑 비밀번호</button><button type="button" style="${pill}" id="abOut">로그아웃</button>`;
  const w = document.querySelector(".wrap") || document.body; w.insertBefore(b, w.firstChild);
  b.querySelector("#abOut").onclick = A$.logout;
  b.querySelector("#abPw").onclick = () => authChangePw(a);
}
async function authChangePw(a) {
  const old = prompt("현재 비밀번호"); if (!old) return;
  const nw = prompt("새 비밀번호 (8자 이상 · 영문+숫자)"); if (!nw) return;
  if (!A$.pwOk(nw)) return alert("새 비밀번호는 8자 이상 · 영문+숫자");
  if (nw !== prompt("새 비밀번호 확인")) return alert("확인이 다릅니다");
  try {
    const { db, sha } = await A$.dbApi(), h = await A$.idh(a.uid);
    const p = await A$.openPw(old, db.users[h]).catch(() => null); if (!p) return alert("현재 비밀번호가 맞지 않습니다");
    db.users[h] = await A$.sealPw(nw, p);
    if (db.wraps && db.wraps[h]) { const w = await A$.openPw(old, db.wraps[h]); db.wraps[h] = await A$.sealPw(nw, w); }
    await A$.dbPut(db, sha, "auth: 비밀번호 변경");
    alert("🔑 비밀번호를 바꿨습니다 (1~2분 뒤 모든 기기에 적용)");
  } catch (e) { alert(e.status === 403 || e.status === 404 ? "이 계정 토큰으로는 변경할 수 없습니다 — 관리자에게 초기화를 요청하세요" : "⚠ " + e.message); }
}
