# Registers a Windows Scheduled Task that runs check.js every 10 minutes.
# Usage: powershell -ExecutionPolicy Bypass -File .\register-task.ps1

$taskName = "ResonaInternWatcher"
$projectDir = $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $nodePath) {
    Write-Error "node.exe not found. Install Node.js and make sure it is on PATH, then retry."
    exit 1
}

$scriptPath = Join-Path $projectDir "check.js"
$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$scriptPath`"" -WorkingDirectory $projectDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force -ErrorAction Stop

$check = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($check) {
    Write-Host "Task '$taskName' registered. check.js will run every 10 minutes."
    Write-Host "Open taskschd.msc to inspect or modify the task."
} else {
    Write-Error "Task registration did not complete as expected."
    exit 1
}
