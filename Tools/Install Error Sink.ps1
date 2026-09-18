<#
Registers "Tools/Error Sink.py" as a logon task so the bot's error recorder always has somewhere to
push, without anyone remembering to start it.

    powershell -ExecutionPolicy Bypass -File "Tools\Install Error Sink.ps1"
    powershell -ExecutionPolicy Bypass -File "Tools\Install Error Sink.ps1" -Uninstall

Runs as the current user, so no administrator rights are needed. pythonw.exe keeps it windowless;
its log goes to errors.log in the repo root.
#>

param(
	[switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$TaskName = "AdventureLand Error Sink"
$Repo     = Split-Path -Parent $PSScriptRoot
$Script   = Join-Path $PSScriptRoot "Error Sink.py"

if ($Uninstall) {
	if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
		Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
		Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
		Write-Host "removed task '$TaskName'"
	} else {
		Write-Host "no task '$TaskName' registered"
	}
	Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe'" |
		Where-Object { $_.CommandLine -like "*Error Sink.py*" } |
		ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host "stopped pid $($_.ProcessId)" }
	return
}

if (-not (Test-Path $Script)) { throw "not found: $Script" }

$Pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $Pythonw) {
	$Python = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
	if (-not $Python) { throw "python is not on PATH" }
	$Pythonw = Join-Path (Split-Path -Parent $Python) "pythonw.exe"
	if (-not (Test-Path $Pythonw)) { $Pythonw = $Python }
}

$action = New-ScheduledTaskAction -Execute $Pythonw -Argument "`"$Script`"" -WorkingDirectory $Repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
	-AllowStartIfOnBatteries `
	-DontStopIfGoingOnBatteries `
	-DontStopOnIdleEnd `
	-StartWhenAvailable `
	-RestartCount 999 `
	-RestartInterval (New-TimeSpan -Minutes 1) `
	-ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
	-MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
	-Principal $principal -Settings $settings -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2

$state = (Get-ScheduledTask -TaskName $TaskName).State
Write-Host "registered '$TaskName' ($Pythonw) - state: $state"

try {
	$probe = Invoke-WebRequest -Uri "http://127.0.0.1:8787/errors" -Method Post `
		-Body '{"character":"install_probe"}' -ContentType "application/json" -UseBasicParsing -TimeoutSec 5
	Write-Host "sink answered on 127.0.0.1:8787 (HTTP $($probe.StatusCode))"
} catch {
	Write-Warning "sink did not answer on 127.0.0.1:8787 yet - check errors.log in $Repo"
}
