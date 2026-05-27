# Active Directory Home Lab

This kit builds a small, isolated Active Directory lab for learning Windows domain administration, identity basics, logging, and defensive testing.

Use this only on lab virtual machines you own. Keep the lab network private or NAT-only, do not expose the domain controller to the internet, and never reuse real passwords.

## Lab Topology

```text
Host computer
  |
  +-- Private/NAT virtual switch: AD-Lab-Net
      |
      +-- DC01   Windows Server, domain controller, DNS
      |          192.168.56.10
      |
      +-- WIN10  Windows client joined to corp.lab
                 DHCP or 192.168.56.20, DNS = 192.168.56.10
```

Recommended VM resources:

| VM | OS | CPU | RAM | Disk |
| --- | --- | --- | --- | --- |
| DC01 | Windows Server 2019/2022/2025 | 2 vCPU | 4 GB | 60 GB |
| WIN10/WIN11 | Windows 10/11 Pro, Enterprise, or Education | 2 vCPU | 4 GB | 60 GB |

Windows Home editions cannot join an AD domain.

## Build Order

1. Create a private or NAT-only virtual network named `AD-Lab-Net`.
2. Install Windows Server on `DC01`.
3. Rename the server to `DC01` and reboot.
4. Give `DC01` a static IP, such as `192.168.56.10/24`.
5. Run `scripts/01-install-domain-controller.ps1` on `DC01` as Administrator.
6. After reboot, sign in as `CORP\Administrator`.
7. Run `scripts/02-seed-directory.ps1` on `DC01` as Administrator.
8. Install Windows 10/11 Pro or Enterprise on `WIN10`.
9. Set the client DNS server to `192.168.56.10`.
10. Run `scripts/03-join-client.ps1` on `WIN10` as Administrator.
11. Take snapshots of both VMs.

## Script Quick Start

On `DC01`, open Administrator PowerShell:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
.\scripts\01-install-domain-controller.ps1 -DomainName corp.lab -NetbiosName CORP -InterfaceAlias "Ethernet" -IpAddress 192.168.56.10 -PrefixLength 24
```

After the domain controller reboots:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
.\scripts\02-seed-directory.ps1
```

On `WIN10`, open Administrator PowerShell:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
.\scripts\03-join-client.ps1 -DomainName corp.lab -DomainControllerIp 192.168.56.10
```

## What Gets Created

The seed script creates:

- OUs for `Admins`, `Workstations`, `Servers`, `Users`, `Groups`, and `Service Accounts`
- Security groups for help desk, workstation admins, server admins, finance, HR, IT, and SOC
- Lab users from `data/lab-users.csv`
- A disabled service account placeholder
- Basic defensive auditing policy

## Suggested Lab Exercises

- Practice adding users, resetting passwords, and assigning group membership.
- Join and remove a workstation from the domain.
- Create a shared folder and test NTFS permissions.
- Review Security logs on `DC01`.
- Turn on failed logon auditing, intentionally fail a test login, and find the event.
- Install Sysmon or Windows Event Forwarding later if you want a blue-team telemetry lab.

## Reset Advice

Take VM snapshots after:

1. Clean OS install.
2. Domain controller promotion.
3. Directory seed completion.
4. Client domain join.

Snapshots make it easy to return to a known-good state when experiments get messy.
