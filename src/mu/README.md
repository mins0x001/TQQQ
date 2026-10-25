# 무한매수 종목 앱 (SOXL · TQQQ · QLD무한) — 공통 템플릿

`soxl.html` · `tqqq.html` · `qldm.html` 는 **직접 고치지 않고** 이 폴더에서 빌드합니다.

- `template.html` — 3개 앱의 공통 코드 (⟦LEV⟧ 같은 토큰 = 종목별 값)
- `config.json` — 종목별 값 (티커·ID 접두어·**버전 VER / 날짜 DATE**)
- `slots.json` — 종목마다 실제로 다른 코드 구간 (⟦@s000⟧ 자리)

## 작업 순서
1. 공통 기능 수정 → `template.html` 만 고침 (3개 앱에 동시에 반영)
2. 종목 전용 수정 → `slots.json` 의 해당 슬롯만 고침
3. 버전 올리기 → `config.json` 의 VER·DATE
4. `python3 tools/build_mu.py` → 3개 HTML 생성 (`--check` = 현재 파일과 비교만)

원복: GitHub 의 `backup/pre-modular-261025` 브랜치 = 모듈화 직전 상태.
`tools/factor_mu.py` 는 이 구조를 처음 만들 때 쓴 1회용 스크립트입니다 (다시 돌리면 현재 HTML 기준으로 재생성).

## 파일 구조 (include-file)
- src/calc/*.js 계산(순수) · src/store/sync.js 저장·동기화 · src/service/*.js 증권사·봇·엑셀
- src/view/{streak,seedsim,records,locguide,vol}.js 화면 카드 · src/shell/app.js 탭·백업·앱 뼈대
- template.html 에는 `//@@include-file 경로` 로 연결됨. 빌드 결과는 모듈화 전과 바이트 동일.

- qld.html(QLD평생): src/qld/template.html + src/qld/{market,streak,strategy,guide,shell,macro,trades,excel,sync}.js + src/calc/qld.js(계산 37개) → build_mu.py 가 함께 생성
- src/lib/shared.js: 종목앱·QLD평생이 같이 쓰는 공통 함수(탭·백업·동기화 일부·배너·복사 등) — 한 곳만 고치면 양쪽 반영
