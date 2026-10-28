# Malware Analysis Sandbox Lab — Capstone Project

**Student:** Chetan Kharade  
**PRN:** 2125UCSM1012  
**Repository:** [https://github.com/chetan475/NPC_Capstone](https://github.com/chetan475/NPC_Capstone)  

Topic: *Malware Analysis Sandbox Using VirtualBox or VMware* — built on **VMware Workstation 26**
with **Debian 13.7 (trixie)** in a **host-only** (no-internet) network.

This folder is the complete, reproducible lab: payloads, listener tools, provisioning config,
evidence logs, screenshots, and the submission report.

## Layout

| Path | Purpose |
|---|---|
| `payloads/lab_reverse.sh` | Educational reverse shell (bash `/dev/tcp` → host TCP/4444, 5 s retry loop, beacon file) |
| `payloads/lab_bind.sh` | Educational bind shell (python3 listens on TCP/4445, forks `/bin/sh` per client) |
| `listeners/c2_listener.py` | Host-side receiver for the reverse shell; sends a scripted command sequence, logs the session |
| `listeners/bind_connect.py` | Host-side client that connects to the bind shell and logs the session |
| `listeners/guest_console.sh` | Template for rendering content on the VM console and dumping the framebuffer |
| `listeners/fb2png.py` | Converts a guest framebuffer dump (1280x800 32bpp BGRX) into a PNG screenshot |
| `build/preseed.cfg` | Debian preseed used to provision the VM unattended (static host-only IP, SSH key, no gateway/DNS) |
| `build/lab_key.pub` | Public half of the throwaway analyst SSH key (private key is NOT committed — generate your own pair with `ssh-keygen -t ed25519` and put its `.pub` into the ISO as `authorized_keys`) |
| `evidence/` | Timestamped transcripts of every stage (isolation, C2 sessions, persistence, restore) |
| `evidence/screenshots/` | VM console screenshots captured from the guest framebuffer |
| `report/Malware-Analysis-Sandbox-Lab-Report-Chetan-Kharade-2125UCSM1012.docx` | **The submission report (Word)** (TOC updates with right-click → Update Field) |
| `report/render/Malware-Analysis-Sandbox-Lab-Report-Chetan-Kharade-2125UCSM1012.pdf` | **The submission report (PDF)** |
| `report/build/generate.js` | Node script that builds the DOCX report from the evidence |

## Lab network map

```
Windows host (analyst)                       Isolated Debian VM
+---------------------------+               +---------------------------+
| VMnet1 adapter            |    host-only  | enp0s17                   |
| 192.168.116.1             |<------------->| 192.168.116.200/24        |
|  c2_listener.py  :4444  <-+--- reverse ---+-- outbound callback       |
|  bind_connect.py -------->+--- bind ------+<- LISTEN 0.0.0.0:4445     |
|  ssh/scp  (key auth) ---->+---- mgmt -----+<-- sshd :22               |
+---------------------------+               +---------------------------+
        NO default route on either side of the guest -> NO internet
```

## Reproduce end-to-end

1. **Provision** — remaster `debian-13.7.0-amd64-netinst.iso` with `build/preseed.cfg`
   (plus `lab_key.pub` as `/authorized_keys` and an isolinux entry with
   `auto=true file=/cdrom/preseed.cfg`), attach to a new VM with a host-only NIC, boot.
   The installer runs hands-off (~10 min).
2. **Snapshot** — power off, then `vmrun -T ws snapshot <vmx> 01-CLEAN-BASELINE`.
3. **Verify isolation** — `evidence/isolation_check.log` shows the test battery.
4. **Reverse shell** — start `c2_listener.py` on the host, launch `lab_reverse.sh` with
   `setsid` in the guest, observe `ps`/`ss`, kill with `pkill -f "lab_[r]everse"`.
5. **Bind shell** — launch `lab_bind.sh` in the guest, connect with `bind_connect.py`.
6. **Persistence demo** — crontab `@reboot` entry, `svcupdate` user, marker file, dropped copy.
7. **Restore** — power off, `vmrun -T ws revertToSnapshot <vmx> 01-CLEAN-BASELINE`, boot,
   re-run the verification battery (`evidence/restore_verification.log`).
8. **VirusTotal** — look up the SHA-256 hashes in `evidence/hashes.txt`
   (no reports exist; nothing was uploaded, per the assignment security note).

## Key findings

- Reverse shell = 2 processes (`bash` loop + `/bin/sh -i` with fd 0/1/2 on the socket),
  reconnects every 5 s when the listener drops.
- Bind shell = 1 resident `python3` on `0.0.0.0:4445`, forks a shell per client.
- Cron/user/dropped-file persistence **survives a VM restart**; only a snapshot revert removes it.
- Revert to `01-CLEAN-BASELINE` removed *everything* (including the payload scripts themselves);
  all seven post-restore checks passed.

## Safety

All credentials in this lab are fictitious. The VM is host-only; it has no route to the
internet at any point. No file from this lab was uploaded to VirusTotal or any other service.
