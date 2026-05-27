# AD Home Lab Build Checklist

## Host Prep

- [ ] Choose hypervisor: Hyper-V, VirtualBox, VMware Workstation, or Proxmox.
- [ ] Create an isolated private/NAT virtual network.
- [ ] Download Windows Server evaluation media.
- [ ] Download Windows 10/11 Enterprise evaluation media or prepare Windows Pro media.

## DC01

- [ ] Create VM with 2 CPU, 4 GB RAM, 60 GB disk.
- [ ] Attach VM to the isolated lab network.
- [ ] Install Windows Server.
- [ ] Rename computer to `DC01`.
- [ ] Reboot.
- [ ] Run `01-install-domain-controller.ps1`.
- [ ] Reboot into the new domain.
- [ ] Confirm DNS and AD DS services are running.
- [ ] Run `02-seed-directory.ps1`.
- [ ] Confirm users and groups exist in Active Directory Users and Computers.

## WIN10/WIN11 Client

- [ ] Create VM with 2 CPU, 4 GB RAM, 60 GB disk.
- [ ] Attach VM to the isolated lab network.
- [ ] Install Windows Pro, Enterprise, or Education.
- [ ] Rename computer to `WIN10` or `WIN11`.
- [ ] Run `03-join-client.ps1`.
- [ ] Reboot.
- [ ] Log in with a lab domain user.
- [ ] Move the computer object into `OU=Workstations,OU=Corp`.

## After Build

- [ ] Take snapshots of both VMs.
- [ ] Document local admin and domain admin credentials in a safe personal password manager.
- [ ] Keep the lab network isolated.
- [ ] Do not reuse lab passwords outside the lab.
