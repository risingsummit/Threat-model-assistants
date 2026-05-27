[CmdletBinding()]
param(
    [string]$OutputPath = ".\windows-security-events.csv",
    [int]$Hours = 24,
    [int[]]$EventIds = @(4624, 4625, 4648, 4672, 4688, 4720, 4722, 4723, 4724, 4728, 4732, 4738, 4740, 4771, 4776, 7045, 1102)
)

$ErrorActionPreference = "Stop"
$startTime = (Get-Date).AddHours(-1 * $Hours)

$filter = @{
    LogName = "Security"
    StartTime = $startTime
    Id = $EventIds
}

Get-WinEvent -FilterHashtable $filter | ForEach-Object {
    [PSCustomObject]@{
        timestamp = $_.TimeCreated.ToUniversalTime().ToString("o")
        host = $env:COMPUTERNAME
        event_id = $_.Id
        user = $_.UserId
        source_ip = ""
        process = ""
        message = ($_.Message -replace "`r?`n", " ")
    }
} | Export-Csv -Path $OutputPath -NoTypeInformation

Write-Host "Exported Windows Security events to $OutputPath"
