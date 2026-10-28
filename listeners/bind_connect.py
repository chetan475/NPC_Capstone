#!/usr/bin/env python3
"""
bind_connect.py — analyst-side client for the lab bind shell.

Runs on the HOST and connects to the bind shell listening inside the
isolated VM (192.168.116.200:4445), sends a fixed command sequence,
and logs the full session to an evidence file.

Usage: python bind_connect.py <guest-ip> <evidence-log-path>
"""
import socket
import sys
import time

GUEST = sys.argv[1] if len(sys.argv) > 1 else "192.168.116.200"
LOG = sys.argv[2] if len(sys.argv) > 2 else "bind_session.log"
PORT = 4445

COMMANDS = [
    ("id", 1.5),
    ("uname -a", 1.0),
    ("hostname", 0.8),
    ("pwd", 0.5),
    ("whoami", 0.5),
    ("ls -la /root", 0.8),
    ("ip -br addr", 0.8),
]

log = open(LOG, "a", buffering=1)


def w(line):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    out = f"[{ts}] {line}"
    print(out)
    log.write(out + "\n")


def drain(sock, buf, seconds=2.0):
    sock.settimeout(seconds)
    deadline = time.time() + seconds
    try:
        while time.time() < deadline:
            data = sock.recv(4096)
            if not data:
                break
            buf += data
    except (socket.timeout, ConnectionResetError):
        pass
    return buf


w(f"[CLIENT] connecting to bind shell at {GUEST}:{PORT}")
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(15)
try:
    sock.connect((GUEST, PORT))
except OSError as e:
    w(f"[ERROR] connect failed: {e}")
    sys.exit(1)

w(f"[CONNECT] bind shell session established with {GUEST}:{PORT}")

buf = drain(sock, b"")
w(f"[BANNER] {buf.decode(errors='replace').strip()!r}")

for cmd, wait in COMMANDS:
    sock.sendall((cmd + "\n").encode())
    time.sleep(wait)
    buf = drain(sock, b"")
    w(f"[CMD] {cmd}\n[OUT] {buf.decode(errors='replace').strip()}")

w("[DONE] closing session")
sock.close()
