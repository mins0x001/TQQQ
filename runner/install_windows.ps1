# 무한매수 로컬 실행기 설치 — Windows 11 · MUHAN-RUNNER V1.00 (261015)
# PowerShell 에 한 줄:  irm https://mins0x001.github.io/TQQQ/runner/install_windows.ps1 | iex
$ErrorActionPreference = "Stop"
$H = "$env:USERPROFILE\muhan"; New-Item -ItemType Directory -Force $H | Out-Null
function Find-Py { foreach ($c in @("py","python")) { $g = Get-Command $c -ErrorAction SilentlyContinue; if ($g) { return $g.Source } }
  $p = Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe" -ErrorAction SilentlyContinue | Select-Object -Last 1; if ($p) { return $p.FullName }; return $null }
$py = Find-Py
if (-not $py) { Write-Host "① 파이썬 설치 중 (winget)…"; winget install -e --id Python.Python.3.12 --scope user --accept-source-agreements --accept-package-agreements | Out-Null; $py = Find-Py }
if (-not $py) { Write-Host "⚠ 파이썬 설치 뒤 PowerShell 을 새로 열고 같은 명령을 한 번 더 실행하세요"; return }
$pyArgs = @(); if ($py -like "*\py.exe") { $pyArgs = @("-3") }
Write-Host "② 실행기 · 브라우저 엔진 설치 중 (2~5분)…"
Invoke-WebRequest "https://mins0x001.github.io/TQQQ/runner/muhan_runner.py" -OutFile "$H\muhan_runner.py" -UseBasicParsing
& $py @pyArgs -m pip install --quiet --upgrade pip playwright tzdata
& $py @pyArgs -m playwright install chromium
Write-Host "③ 키 입력"
& $py @pyArgs "$H\muhan_runner.py" setup
$exe = (& $py @pyArgs -c "import sys,os;print(os.path.join(os.path.dirname(sys.executable),'pythonw.exe'))").Trim()
$a = New-ScheduledTaskAction -Execute $exe -Argument "`"$H\muhan_runner.py`" tick" -WorkingDirectory $H
$t = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5)
$s = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances Parallel -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName "MuhanRunner" -Action $a -Trigger $t -Settings $s -Description "무한매수 로컬 실행기 (5분마다)" -Force | Out-Null
powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 2>$null; powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 2>$null; powercfg /SETACTIVE SCHEME_CURRENT 2>$null
Write-Host "`n✅ 설치 완료 — 작업 스케줄러 'MuhanRunner' 가 5분마다 실행 (절전 중이면 깨워서 실행)"
Write-Host "   상태 보기: py `"$H\muhan_runner.py`" status   ·   키 다시 입력: py `"$H\muhan_runner.py`" setup"
