# tests — 계산 골든 테스트

- `calc_golden.js` : soxl·tqqq·qldm 앱에 같은 결정적 가짜 시세 2종을 넣고 계산 함수 46개 결과를 저장된 값(`golden/`)과 비교
- 계산 로직을 **일부러** 바꿨다면: `node tests/calc_golden.js --update` 로 골든을 갱신하고 커밋 (바꾸지 않았는데 DIFF 면 버그)
- 전체 검증: `tools/check_all.sh`
