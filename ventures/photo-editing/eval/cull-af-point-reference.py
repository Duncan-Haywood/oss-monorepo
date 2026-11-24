"""Compares site/rawpreview.mjs's AF points (eval/cull-af-point.mjs output)
with metadata-extractor's own decoding of the same files, the text dumps the
sample repository ships in <format>/metadata/java/<file>.txt.

  python3 eval/cull-af-point-reference.py mei OUT/af.jsonl

Each check turns the reference's raw tag values into the same fractions of
the frame and reports the largest difference (0.002 = rounding of the
reference's printed values or of a box's centre).
"""
import json
import os
import re
import sys


def ref_point(text):
    m = re.search(r"Sony Makernote - 0x2027\] .*= (\d+) (\d+) (\d+) (\d+)", text)
    if m:
        w, h, x, y = map(int, m.groups())
        return "Sony 0x2027", [(x / w, y / h)]
    m = re.search(r"Focus Pixel = (\d+) (\d+)", text)
    if m:
        w = int(re.search(r"Exif Image Width = (\d+)", text).group(1))
        h = int(re.search(r"Exif Image Height = (\d+)", text).group(1))
        return "Fujifilm 0x1023", [(int(m.group(1)) / w, int(m.group(2)) / h)]
    m = re.search(r"Af Point Position = (\d+)/(\d+) (\d+)/(\d+)", text)
    if m:
        a, b, c, d = map(int, m.groups())
        if a > b:
            return "Panasonic 0x004d", []  # 0xffffffff: none
        return "Panasonic 0x004d", [(a / b, c / d)]
    m = re.search(r"AF Areas = .*?\((\d+)/255,(\d+)/255\)-\((\d+)/255,(\d+)/255\)", text)
    if m:
        x1, y1, x2, y2 = map(int, m.groups())
        return "Olympus 0x0304", [((x1 + x2) / 510, (y1 + y2) / 510)]
    if "AF Areas = \n" in text or re.search(r"AF Areas = $", text, re.M):
        return "Olympus 0x0304", []
    m = re.search(r"AF Area X Positions = ([-\d ]+)\n.*AF Area Y Positions = ([-\d ]+)\n.*AF Points in Focus = (\d+)", text, re.S)
    if m:
        xs = list(map(int, m.group(1).split()))
        ys = list(map(int, m.group(2).split()))
        i = int(m.group(3))
        w = int(re.search(r"AF Image Width = (\d+)", text).group(1))
        h = int(re.search(r"AF Image Height = (\d+)", text).group(1))
        return "Canon AFInfo", [(0.5 + xs[i] / w, 0.5 - ys[i] / h)]
    return None, None


def main(root, jsonl):
    rows = [json.loads(l) for l in open(jsonl) if l.strip()]
    checked = agree = 0
    print("file\treference\tref x,y\tours x,y\tmax diff")
    for r in rows:
        fmt, name = r["file"].split("/", 1)
        p = os.path.join(root, fmt, "metadata", "java", name + ".txt")
        if not os.path.exists(p):
            continue
        src, pts = ref_point(open(p, encoding="utf-8", errors="replace").read())
        if src is None:
            continue
        af = r.get("af")
        ours = (af["x"], af["y"]) if af and "x" in af else None
        checked += 1
        if not pts:
            ok = ours is None
            print(f"{r['file']}\t{src}\tnone\t{ours and f'{ours[0]:.3f},{ours[1]:.3f}' or 'none'}\t{'agree' if ok else 'DIFFER'}")
        else:
            d = max(abs(ours[0] - pts[0][0]), abs(ours[1] - pts[0][1])) if ours else 1
            ok = d <= 0.002
            print(f"{r['file']}\t{src}\t{pts[0][0]:.3f},{pts[0][1]:.3f}\t{ours and f'{ours[0]:.3f},{ours[1]:.3f}' or 'none'}\t{d:.4f}")
        agree += ok
    print(f"# {agree} of {checked} files agree with metadata-extractor")


if __name__ == "__main__":
    main(*sys.argv[1:])
