# MUHAN-RUNNER V1.02 (261015) installer for Windows 11  (ASCII only - safe for Windows PowerShell 5.1)
# Run in PowerShell:  irm https://mins0x001.github.io/TQQQ/runner/install_windows.ps1 | iex
$ErrorActionPreference = "Stop"
$H = "$env:USERPROFILE\muhan"; New-Item -ItemType Directory -Force $H | Out-Null

function Test-Py($p) {   # real Python only (skip the Microsoft Store alias in WindowsApps)
  if (-not $p -or $p -like "*WindowsApps*" -or -not (Test-Path $p)) { return $false }
  try { $o = & $p -c "print(12345)" 2>$null; return ("$o".Trim() -eq "12345") } catch { return $false }
}
function Find-Py {
  $c = @()
  $c += Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | ForEach-Object FullName
  $c += Get-ChildItem "C:\Program Files\Python3*\python.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | ForEach-Object FullName
  $c += (Get-Command python.exe -All -ErrorAction SilentlyContinue | ForEach-Object Source)
  foreach ($p in $c) { if (Test-Py $p) { return $p } }
  return $null
}

$py = Find-Py
if (-not $py) {
  Write-Host "[1/4] Installing Python 3.12 (winget) ..." -ForegroundColor Cyan
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install -e --id Python.Python.3.12 --scope user --silent --accept-source-agreements --accept-package-agreements | Out-Null
  } else {
    $exe = "$env:TEMP\python-3.12.7-amd64.exe"
    Invoke-WebRequest "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe" -OutFile $exe -UseBasicParsing
    Start-Process $exe -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_launcher=1" -Wait
  }
  $py = Find-Py
}
if (-not $py) { Write-Host "Python install failed. Install Python 3.12 from python.org, then run this line again." -ForegroundColor Red; return }
Write-Host "Python: $py" -ForegroundColor Green

Write-Host "[2/4] Installing runner + browser engine (2-5 min) ..." -ForegroundColor Cyan
Invoke-WebRequest "https://mins0x001.github.io/TQQQ/runner/muhan_runner.py" -OutFile "$H\muhan_runner.py" -UseBasicParsing
& $py -m pip install --quiet --disable-pip-version-check --upgrade pip playwright tzdata
& $py -m playwright install chromium
if ($LASTEXITCODE -ne 0) { Write-Host "Browser engine install failed - run this line again." -ForegroundColor Red; return }

Write-Host "[3/4] Keys (GitHub token, Meritz app keys per hub)" -ForegroundColor Cyan
$env:PYTHONIOENCODING = "utf-8"
& $py "$H\muhan_runner.py" setup

Write-Host "[4/4] Task Scheduler (every 5 min, wakes PC)" -ForegroundColor Cyan
$pyw = Join-Path (Split-Path $py) "pythonw.exe"; if (-not (Test-Path $pyw)) { $pyw = $py }
$a = New-ScheduledTaskAction -Execute $pyw -Argument "`"$H\muhan_runner.py`" tick" -WorkingDirectory $H
$t = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5)
$s = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances Parallel -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName "MuhanRunner" -Action $a -Trigger $t -Settings $s -Description "Muhan local runner (every 5 min)" -Force | Out-Null
foreach ($m in "/SETACVALUEINDEX","/SETDCVALUEINDEX") { cmd /c "powercfg $m SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 >nul 2>&1" }; cmd /c "powercfg /SETACTIVE SCHEME_CURRENT >nul 2>&1"
Set-Content "$H\muhan.cmd" "@`"$py`" `"$H\muhan_runner.py`" %*" -Encoding ASCII
Write-Host ""
Write-Host "DONE. Task 'MuhanRunner' runs every 5 minutes (wakes the PC from sleep)." -ForegroundColor Green
Write-Host "Status : $H\muhan.cmd status"
Write-Host "Keys   : $H\muhan.cmd setup"
& $py "$H\muhan_runner.py" status
