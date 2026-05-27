[CmdletBinding()]
param(
    [string]$BaseOuName = "Corp",
    [string]$UsersCsv = "$PSScriptRoot\..\data\lab-users.csv",
    [string]$DefaultPassword = "LabOnly-ChangeMe!2026"
)

$ErrorActionPreference = "Stop"
Import-Module ActiveDirectory

$domain = Get-ADDomain
$baseDn = "OU=$BaseOuName,$($domain.DistinguishedName)"
$securePassword = ConvertTo-SecureString $DefaultPassword -AsPlainText -Force

function New-LabOu {
    param(
        [string]$Name,
        [string]$Path
    )

    $dn = "OU=$Name,$Path"
    if (-not (Get-ADOrganizationalUnit -Identity $dn -ErrorAction SilentlyContinue)) {
        New-ADOrganizationalUnit -Name $Name -Path $Path -ProtectedFromAccidentalDeletion $false
    }
}

function New-LabGroup {
    param(
        [string]$Name,
        [string]$Path,
        [string]$Description
    )

    if (-not (Get-ADGroup -Filter "SamAccountName -eq '$Name'" -ErrorAction SilentlyContinue)) {
        New-ADGroup -Name $Name -SamAccountName $Name -GroupCategory Security -GroupScope Global -Path $Path -Description $Description
    }
}

if (-not (Get-ADOrganizationalUnit -Identity $baseDn -ErrorAction SilentlyContinue)) {
    New-ADOrganizationalUnit -Name $BaseOuName -Path $domain.DistinguishedName -ProtectedFromAccidentalDeletion $false
}

$ouNames = @("Admins", "Workstations", "Servers", "Users", "Groups", "Service Accounts")
foreach ($ou in $ouNames) {
    New-LabOu -Name $ou -Path $baseDn
}

$groupsOu = "OU=Groups,$baseDn"
$usersOu = "OU=Users,$baseDn"
$serviceAccountsOu = "OU=Service Accounts,$baseDn"

$groups = @{
    "GG_HelpDesk" = "Help desk analysts"
    "GG_WorkstationAdmins" = "Local workstation administration role"
    "GG_ServerAdmins" = "Server administration role"
    "GG_Finance" = "Finance department"
    "GG_HR" = "Human resources department"
    "GG_IT" = "IT department"
    "GG_SOC" = "Security operations"
}

foreach ($group in $groups.GetEnumerator()) {
    New-LabGroup -Name $group.Key -Path $groupsOu -Description $group.Value
}

Import-Csv $UsersCsv | ForEach-Object {
    $user = $_
    $displayName = "$($user.GivenName) $($user.Surname)"
    $upn = "$($user.SamAccountName)@$($domain.DNSRoot)"

    if (-not (Get-ADUser -Filter "SamAccountName -eq '$($user.SamAccountName)'" -ErrorAction SilentlyContinue)) {
        New-ADUser `
            -SamAccountName $user.SamAccountName `
            -UserPrincipalName $upn `
            -Name $displayName `
            -GivenName $user.GivenName `
            -Surname $user.Surname `
            -DisplayName $displayName `
            -Department $user.Department `
            -Title $user.Title `
            -Path $usersOu `
            -AccountPassword $securePassword `
            -Enabled $true `
            -ChangePasswordAtLogon $true
    }

    $user.Groups -split ";" | Where-Object { $_ } | ForEach-Object {
        Add-ADGroupMember -Identity $_ -Members $user.SamAccountName -ErrorAction SilentlyContinue
    }
}

if (-not (Get-ADUser -Filter "SamAccountName -eq 'svc_backup'" -ErrorAction SilentlyContinue)) {
    New-ADUser `
        -SamAccountName "svc_backup" `
        -UserPrincipalName "svc_backup@$($domain.DNSRoot)" `
        -Name "svc_backup" `
        -Description "Disabled placeholder service account for lab exercises" `
        -Path $serviceAccountsOu `
        -AccountPassword $securePassword `
        -Enabled $false
}

auditpol /set /subcategory:"Logon" /success:enable /failure:enable | Out-Null
auditpol /set /subcategory:"Account Lockout" /success:enable /failure:enable | Out-Null
auditpol /set /subcategory:"User Account Management" /success:enable /failure:enable | Out-Null
auditpol /set /subcategory:"Security Group Management" /success:enable /failure:enable | Out-Null

Write-Host "Directory seed complete." -ForegroundColor Green
Write-Host "Default lab password for created users: $DefaultPassword" -ForegroundColor Yellow
Write-Host "Users are set to change password at next logon."
