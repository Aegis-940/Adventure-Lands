param(
	[switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$TaskName  = "AdventureLand Watchdog"
$Repo      = Split-Path -Parent $PSScriptRoot
$Script    = Join-Path $PSScriptRoot "Watchdog.py"
$FlagsKey  = "HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments"
$ClientExe = "Adventure Land.exe"
$BaseFlags = "--disable-backgrounding-occluded-windows --disable-background-timer-throttling --disable-renderer-backgrounding --disable-features=IntensiveWakeUpThrottling"
$DebugFlag = "--remote-debugging-port=9222"

function Set-ClientFlags([string]$Flags) {
	$regPath = $FlagsKey -replace "^HKCU:", "HKCU"
	Start-Process reg.exe -Verb RunAs -Wait -WindowStyle Hidden `
		-ArgumentList "add `"$regPath`" /v `"$ClientExe`" /t REG_SZ /d `"$Flags`" /f"
	$written = (Get-ItemProperty -Path $FlagsKey -ErrorAction SilentlyContinue).$ClientExe
	if ($written -ne $Flags) { throw "the client flags were not written (was the UAC prompt declined?)" }
	Write-Host "client flags ($ClientExe): $Flags"
}

if ($Uninstall) {
	if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
		Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
		Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
		Write-Host "removed task '$TaskName'"
	} else {
		Write-Host "no task '$TaskName' registered"
	}
	Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe'" |
		Where-Object { $_.CommandLine -like "*Watchdog.py*" } |
		ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host "stopped pid $($_.ProcessId)" }
	Set-ClientFlags $BaseFlags
	Write-Host "restart Steam and the client to close the debugging port"
	return
}

if (-not (Test-Path $Script)) { throw "not found: $Script" }

Set-ClientFlags "$BaseFlags $DebugFlag"
if ([Environment]::GetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "User")) {
	[Environment]::SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", $null, "User")
	Write-Host "removed the user-wide WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS; the registry value above replaces it"
}

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
Start-Sleep -Seconds 3

$state = (Get-ScheduledTask -TaskName $TaskName).State
Write-Host "registered '$TaskName' ($Pythonw) - state: $state"

try {
	Invoke-WebRequest -Uri "http://127.0.0.1:9222/json/version" -UseBasicParsing -TimeoutSec 3 | Out-Null
	Write-Host "debugging port 9222 is open - the watchdog is attached"
} catch {
	Write-Warning "debugging port 9222 is closed - quit Steam and the client completely, then start them again"
}
