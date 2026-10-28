#!/usr/bin/env python3
"""
vncshot.py — minimal RFB client for the lab VM's VMware VNC remote display.

Modes:
  vncshot.py shot <out.png>              take a console screenshot
  vncshot.py type "some text<ENTER>"     send text to the console (keysyms),
                                         then take <out2> if given as 3rd arg

Supported pseudo-syntax in text: <ENTER> <TAB> <ESC> <BACKSPACE>
"""
import socket
import struct
import sys
import time
import zlib

HOST, PORT = "127.0.0.1", 5901
PASSWORD = "labvnc26"

SPECIAL = {"<ENTER>": 0xFF0D, "<TAB>": 0xFF09, "<ESC>": 0xFF1B,
           "<BACKSPACE>": 0xFF08, "<SPACE>": 0x0020}


def vnc_des_key(password):
    pw = password.encode()[:8].ljust(8, b"\0")
    return bytes(int(f"{b:08b}"[::-1], 2) for b in pw)


def recv_exact(s, n):
    buf = b""
    while len(buf) < n:
        d = s.recv(n - len(buf))
        if not d:
            raise ConnectionError("socket closed")
        buf += d
    return buf


def connect_rfb():
    s = socket.create_connection((HOST, PORT), timeout=20)
    s.settimeout(20)
    ver = recv_exact(s, 12)
    if not ver.startswith(b"RFB 003."):
        raise RuntimeError(f"not RFB: {ver!r}")
    s.sendall(b"RFB 003.008\n")
    nsec = recv_exact(s, 1)[0]
    sec_types = recv_exact(s, nsec) if nsec else b""
    if 1 in sec_types:
        s.sendall(bytes([1]))  # None
        result = recv_exact(s, 4)
    elif 2 in sec_types:
        s.sendall(bytes([2]))
        challenge = recv_exact(s, 16)
        from Crypto.Cipher import DES
        c = DES.new(vnc_des_key(PASSWORD), DES.MODE_ECB)
        resp = c.encrypt(challenge[:8]) + c.encrypt(challenge[8:16])
        s.sendall(resp)
        result = recv_exact(s, 4)
    else:
        raise RuntimeError(f"server offers security types {list(sec_types)}")
    if result != b"\0\0\0\0":
        raise RuntimeError("VNC authentication failed (check key/password)")
    s.sendall(b"\0")  # ClientInit: not shared

    init = recv_exact(s, 20)  # w(2) h(2) pixel-format(16)
    w, h = struct.unpack(">HH", init[:4])
    bpp, depth, bigend, truecol = init[4], init[5], init[6], init[7]
    namelen = struct.unpack(">I", recv_exact(s, 4))[0]
    name = recv_exact(s, namelen).decode(errors="replace")

    # SetPixelFormat: 32bpp, little-endian, truecolor, BGRX (shifts 16/8/0)
    pf = struct.pack(">BBBBHHHBBBxxx", 32, 24, 0, 1, 255, 255, 255, 16, 8, 0)
    s.sendall(b"\0" + b"\0\0\0" + pf)
    # SetEncodings: raw only
    s.sendall(struct.pack(">BxxxH", 2, 1) + struct.pack(">i", 0))
    print(f"connected: {w}x{h} '{name}'", file=sys.stderr)
    return s, w, h


def request_and_read(s, w, h):
    s.sendall(struct.pack(">BBHHHH", 3, 0, 0, 0, w, h))  # full update
    hdr = recv_exact(s, 4)
    assert hdr[0] == 0, f"unexpected message type {hdr[0]}"
    nrects = struct.unpack(">H", hdr[2:4])[0]
    px = bytearray(w * h * 3)
    for _ in range(nrects):
        rx, ry, rw, rh = struct.unpack(">HHHH", recv_exact(s, 8))
        enc, = struct.unpack(">i", recv_exact(s, 4))
        assert enc == 0, f"encoding {enc} != raw"
        raw = recv_exact(s, rw * rh * 4)
        rowbytes = rw * 3
        for row in range(rh):
            src = raw[row * rw * 4:(row + 1) * rw * 4]
            dst = px[((ry + row) * w + rx) * 3:((ry + row) * w + rx) * 3 + rowbytes]
            for col in range(rw):
                b0, b1, b2 = src[col * 4], src[col * 4 + 1], src[col * 4 + 2]
                dst[col * 3] = b0
                dst[col * 3 + 1] = b1
                dst[col * 3 + 2] = b2
    return px


def write_png(path, w, h, rgb):
    def chunk(t, data):
        return (struct.pack(">I", len(data)) + t + data +
                struct.pack(">I", zlib.crc32(t + data) & 0xFFFFFFFF))
    raw = b"".join(b"\x00" + rgb[y * w * 3:(y + 1) * w * 3] for y in range(h))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) +
                chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def send_text(s, text):
    i = 0
    while i < len(text):
        for tok, sym in SPECIAL.items():
            if text.startswith(tok, i):
                i += len(tok)
                s.sendall(struct.pack(">BBHI", 4, 1, 0, sym))
                time.sleep(0.03)
                s.sendall(struct.pack(">BBHI", 4, 0, 0, sym))
                break
        else:
            ch = text[i]
            i += 1
            if 0x20 <= ord(ch) <= 0x7E:
                s.sendall(struct.pack(">BBHI", 4, 1, 0, ord(ch)))
                time.sleep(0.03)
                s.sendall(struct.pack(">BBHI", 4, 0, 0, ord(ch)))
            time.sleep(0.03)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "shot"
    s, w, h = connect_rfb()
    time.sleep(0.4)
    if mode == "type":
        send_text(s, sys.argv[2])
        time.sleep(0.6)
        if len(sys.argv) > 3:
            px = request_and_read(s, w, h)
            write_png(sys.argv[3], w, h, px)
    else:
        out = sys.argv[2] if len(sys.argv) > 2 else "console.png"
        px = request_and_read(s, w, h)
        write_png(out, w, h, px)
        print(f"saved {out}")
    s.close()


if __name__ == "__main__":
    main()
