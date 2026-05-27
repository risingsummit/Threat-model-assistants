[CmdletBinding()]
param(
    [string]$GpoName = "LAB - Basic Workstation Hardening"
)

$ErrorActionPreference = "Stop"
Import-Module GroupPolicy
Import-Module ActiveDirectory

$domain = Get-ADDomain
$workstationsOu = "OU=Workstations,OU=Corp,$($domain.DistinguishedName)"

if (-not (Get-GPO -Name $GpoName -ErrorAction SilentlyContinue)) {
    New-GPO -Name $GpoName | Out-Null
}

$gpo = Get-GPO -Name $GpoName

Set-GPRegistryValue -Name $GpoName -Key "HKLM\Software\Microsoft\Windows\CurrentVersion\Policies\System" -ValueName "EnableLUA" -Type DWord -Value 1
Set-GPRegistryValue -Name $GpoName -Key "HKLM\Software\Microsoft\Windows\CurrentVersion\Policies\System" -ValueName "ConsentPromptBehaviorAdmin" -Type DWord -Value 5
Set-GPRegistryValue -Name $GpoName -Key "HKLM\Software\Microsoft\Windows\CurrentVersion\Policies\System" -ValueName "ConsentPromptBehaviorUser" -Type DWord -Value 3
Set-GPRegistryValue -Name $GpoName -Key "HKLM\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" -ValueName "NoAutorun" -Type DWord -Value 1

if (Get-ADOrganizationalUnit -Identity $workstationsOu -ErrorAction SilentlyContinue) {
    New-GPLink -Name $GpoName -Target $workstationsOu -LinkEnabled Yes -ErrorAction SilentlyContinue | Out-Null
}
else {
    Write-Host "Workstations OU was not found. GPO created but not linked." -ForegroundColor Yellow
}

Write-Host "Basic hardening GPO is ready." -ForegroundColor Green
