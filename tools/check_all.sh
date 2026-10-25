#!/bin/sh
# 한 번에 검증: ① 빌드 결과가 현재 HTML 과 같은지 ② 계산 골든 테스트 (Playwright 필요)
cd "$(dirname "$0")/.." || exit 1
python3 tools/build_mu.py --check || exit 1
NODE_PATH=$(npm root -g) node tests/calc_golden.js && NODE_PATH=$(npm root -g) node tests/loc_golden.js
