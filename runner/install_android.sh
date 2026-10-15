#!/data/data/com.termux/files/usr/bin/bash
# 무한매수 로컬 실행기 설치 — Android (Termux) · MUHAN-RUNNER V1.00 (261015)
# Termux(F-Droid 판)에 한 줄:  curl -fsSL https://mins0x001.github.io/TQQQ/runner/install_android.sh | bash
# 브라우저 엔진(Chromium)은 Termux 에서 직접 못 돌아서, Termux 안에 Ubuntu(proot)를 깔고 그 안에서 실행합니다.
set -e
echo "① Termux 패키지 (2~3분)"
pkg update -y >/dev/null && pkg install -y proot-distro cronie termux-services curl >/dev/null
echo "② Ubuntu + 파이썬 + 브라우저 엔진 (10~20분 · 와이파이 권장)"
proot-distro list 2>/dev/null | grep -q "ubuntu.*installed" || proot-distro install ubuntu
proot-distro login ubuntu -- bash -c "apt-get update -y >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-pip tzdata curl >/dev/null \
 && pip3 install --quiet --break-system-packages playwright tzdata && python3 -m playwright install --with-deps chromium >/dev/null \
 && mkdir -p /root/muhan && curl -fsSL https://mins0x001.github.io/TQQQ/runner/muhan_runner.py -o /root/muhan/muhan_runner.py"
cat > $PREFIX/bin/muhan <<'EOS'
#!/data/data/com.termux/files/usr/bin/bash
exec proot-distro login ubuntu -- python3 /root/muhan/muhan_runner.py "${@:-status}"
EOS
chmod +x $PREFIX/bin/muhan
echo "③ 키 입력"
muhan setup < /dev/tty
( crontab -l 2>/dev/null | grep -v muhan; echo "*/5 * * * * $PREFIX/bin/muhan tick >/dev/null 2>&1" ) | crontab -
mkdir -p ~/.termux/boot
printf '#!/data/data/com.termux/files/usr/bin/sh\ntermux-wake-lock\ncrond\n' > ~/.termux/boot/start-muhan && chmod +x ~/.termux/boot/start-muhan
termux-wake-lock; pgrep crond >/dev/null || crond
echo ""
echo "✅ 설치 완료 — 5분마다 자동 실행 (cron)"
echo "   꼭 하기: ① Termux:Boot 앱 설치 후 한 번 열기(재부팅 뒤 자동 시작) ② 설정 → 앱 → Termux → 배터리 → '제한 없음'"
echo "   상태 보기: muhan status · 키 다시 입력: muhan setup · 지금 실행: muhan run muhan order"
