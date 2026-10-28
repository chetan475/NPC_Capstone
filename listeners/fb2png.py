#!/usr/bin/env python3
"""fb2png.py — convert a Linux framebuffer dump (32bpp BGRX) to PNG.

Usage: fb2png.py <raw-file> <width> <height> <out.png>
"""
import struct
import sys
import zlib


def main():
    raw_path, w, h, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    data = open(raw_path, "rb").read()
    stride = w * 4
    rows = []
    for y in range(h):
        row = data[y * stride:(y + 1) * stride][:w * 4]
        px = bytearray(w * 3)
        for x in range(w):
            b, g, r = row[x * 4], row[x * 4 + 1], row[x * 4 + 2]
            px[x * 3] = r
            px[x * 3 + 1] = g
            px[x * 3 + 2] = b
        rows.append(bytes(px))
    png = raw_to_png(w, h, rows)
    with open(out, "wb") as f:
        f.write(png)
    print(f"saved {out} ({w}x{h})")


def raw_to_png(w, h, rows):
    def chunk(t, data):
        return (struct.pack(">I", len(data)) + t + data +
                struct.pack(">I", zlib.crc32(t + data) & 0xFFFFFFFF))
    raw = b"".join(b"\x00" + r for r in rows)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) +
            chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    main()
