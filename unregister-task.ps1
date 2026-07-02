# Removes the registered scheduled task.
# Usage: powershell -ExecutionPolicy Bypass -File .\unregister-task.ps1

$taskName = "ResonaInternWatcher"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Host "Task '$taskName' removed."
