[CmdletBinding()]
param(
    [string]$DomainName = "corp.lab",
    [string]$NetbiosName = "CORP",
    [string]$InterfaceAlias,
    [string]$IpAddress = "192.168.56.10",
    [int]$PrefixLength = 24,
    [string]$DefaultGateway,
    [string[]]$DnsForwarders = @("1.1.1.1", "8.8.8.8")
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

Write-Host "Preparing $env:COMPUTERNAME to become the first domain controller for $DomainName." -ForegroundColor Cyan
Write-Host "This will install AD DS, create a new forest, install DNS, and reboot when complete." -ForegroundColor Yellow

if ($InterfaceAlias) {
    Write-Host "Setting static IPv4 address $IpAddress/$PrefixLength on $InterfaceAlias."
    Get-NetIPAddress -InterfaceAlias $InterfaceAlias -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -ne "127.0.0.1" } |
        Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue

    $networkParams = @{
        InterfaceAlias = $InterfaceAlias
        IPAddress = $IpAddress
        PrefixLength = $PrefixLength
    }
    if ($DefaultGateway) {
        $networkParams.DefaultGateway = $DefaultGateway
    }
    New-NetIPAddress @networkParams | Out-Null
    Set-DnsClientServerAddress -InterfaceAlias $InterfaceAlias -ServerAddresses $IpAddress
}
else {
    Write-Host "No InterfaceAlias supplied. Skipping static IP setup." -ForegroundColor Yellow
}

Install-WindowsFeature AD-Domain-Services -IncludeManagementTools

$safeModePassword = Read-Host "Enter Directory Services Restore Mode password" -AsSecureString

$forestParams = @{
    DomainName = $DomainName
    DomainNetbiosName = $NetbiosName
    InstallDns = $true
    SafeModeAdministratorPassword = $safeModePassword
    Force = $true
}

Install-ADDSForest @forestParams

if ($DnsForwarders.Count -gt 0) {
    Write-Host "DNS forwarders can be set after reboot with:"
    Write-Host "Set-DnsServerForwarder -IPAddress $($DnsForwarders -join ', ')"
}
