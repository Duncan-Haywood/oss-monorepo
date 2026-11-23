"""Independent check for the Windows Rating tag (0x4746) in TIFF raws: a
stdlib walk of IFD0, its chain, SubIFDs and the EXIF IFD, written apart from
site/rawpreview.mjs. Usage: python3 -I eval/cull-rating-tag-scan.py DIR"""
import os, struct, sys

def walk(path):
    b = open(path, "rb").read(4 << 20)
    if b[:2] not in (b"II", b"MM"):
        return None
    e = "<" if b[:2] == b"II" else ">"
    found, seen = {}, set()
    def ifd(off, depth):
        if not off or depth > 4 or off in seen or off + 2 > len(b):
            return
        seen.add(off)
        n = struct.unpack_from(e + "H", b, off)[0]
        if n > 1000 or off + 2 + n * 12 > len(b):
            return
        for i in range(n):
            tag, typ, cnt, val = struct.unpack_from(e + "HHII", b, off + 2 + i * 12)
            raw = b[off + 10 + i * 12: off + 14 + i * 12]
            if tag in (0x4746, 0x4749) and typ == 3:
                found[hex(tag)] = struct.unpack_from(e + "H", raw)[0]
            if tag == 0x8769:
                ifd(val, depth + 1)
            if tag == 0x14A:
                if cnt == 1:
                    ifd(val, depth + 1)
                elif val + 4 * cnt <= len(b):
                    for k in range(cnt):
                        ifd(struct.unpack_from(e + "I", b, val + 4 * k)[0], depth + 1)
        nxt = struct.unpack_from(e + "I", b, off + 2 + n * 12)[0] if off + 6 + n * 12 <= len(b) else 0
        ifd(nxt, depth)
    ifd(struct.unpack_from(e + "I", b, 4)[0], 0)
    return found

root = sys.argv[1]
for dp, _, names in sorted(os.walk(root)):
    for n in sorted(names):
        p = os.path.join(dp, n)
        r = walk(p) if os.path.getsize(p) > 64 else None
        if r:
            print(os.path.relpath(p, root), r)
