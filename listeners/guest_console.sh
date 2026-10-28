#!/bin/bash
# guest_console.sh — render content on the VM console (tty1) and dump the
# framebuffer to stdout so the host can turn it into a screenshot.
#
# Usage (on the host):
#   ssh root@192.168.116.200 'bash -s' < guest_console.sh <<'CMDS'
#     ... commands whose output should appear on the console ...
# CMDS
# (host redirects stdout of the dd to a file, then fb2png.py converts it)

set -u
CH=/dev/tty1

# clear console, print lab banner
setterm --clear all >"$CH" 2>/dev/null || printf '\033[2J\033[H' >"$CH"
{
  echo "==============================================================="
  echo "  Malware Analysis Sandbox Lab  —  malware-lab (192.168.116.200)"
  echo "  VMware Workstation 26  |  Debian 13  |  host-only VMnet1"
  echo "==============================================================="
  echo
} >"$CH"

# run the commands passed on stdin, tee output to console
bash 2>&1 | tee "$CH"

sleep 1
dd if=/dev/fb0 bs=5120 count=200000 2>/dev/null
