[CmdletBinding()]
param(
    [string]$DomainName = "corp.lab",
    [string]$DomainControllerIp = "192.168.56.10",
    [string]$InterfaceAlias
)

$ErrorActionPreference = "Stop"

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this script from an Administrator PowerShell window."
    }
}

Assert-Administrator

if (-not $InterfaceAlias) {
    $adapter = Get-NetIPInterface -AddressFamily IPv4 |
        Where-Object { $_.ConnectionState -eq "Connected" -and $_.InterfaceAlias -notlike "Loopback*" } |
        Sort-Object -Property InterfaceMetric |
        Select-Object -First 1
    if (-not $adapter) {
        throw "No active network adapter found. Supply -InterfaceAlias manually."
    }
    $InterfaceAlias = $adapter.InterfaceAlias
}

Write-Host "Setting DNS server on $InterfaceAlias to $DomainControllerIp."
Set-DnsClientServerAddress -InterfaceAlias $InterfaceAlias -ServerAddresses $DomainControllerIp

Write-Host "Testing domain controller connectivity."
Resolve-DnsName $DomainName -Server $DomainControllerIp | Out-Null

$credential = Get-Credential -Message "Enter a domain account allowed to join computers, such as CORP\Administrator"
Add-Computer -DomainName $DomainName -Credential $credential -Restart
