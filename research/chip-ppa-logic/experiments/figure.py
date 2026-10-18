"""Write experiments/clz16.svg: cells*depth of every clz16 candidate, proposer attempts vs sweep configs.

    python experiments/figure.py

Parsed from the committed results.txt (clz16 block only), never retyped. Rejected attempts are omitted
(listed in the label). The reference for-loop is the dashed line.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROP = re.compile(r"^\s+(c\d_\w+)\s+cells\s+\d+ depth\s+\d+ cells\*depth (\d+)")
SWEEP = re.compile(r"^\s+\('(\w+)',(?: (\d+))?\)\s+cells\s+\d+ depth\s+\d+ cells\*depth (\d+)")
REF = re.compile(r"^== clz16: .* cells\*depth (\d+)")


def parse():
    ref, items, block = None, [], False
    for line in (HERE / "results.txt").read_text().splitlines():
        if line.startswith("== "):
            block = line.startswith("== clz16")
        if not block:
            continue
        if (m := REF.match(line)):
            ref = int(m[1])
        elif (m := PROP.match(line)):
            items.append(("proposer " + m[1].split("_", 1)[1], int(m[2]), "#c0392b"))
        elif (m := SWEEP.match(line)):
            items.append((f"{m[1]} {m[2] or ''}".strip(), int(m[3]), "#1f6fb2"))
    return ref, items


def main():
    ref, items = parse()
    items.sort(key=lambda t: t[1])
    W, H, L, R, T, B = 640, 410, 50, 16, 40, 115
    lo, hi = 0, max(v for _, v, _ in items) * 1.02
    gw = (W - L - R) / len(items)
    py = lambda v: T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Bars: cells times depth of each clz16 candidate against the reference, lower is better">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">clz16 cells&#215;depth, sorted (axis starts at 0; lower is better)</text>']
    for k in range(5):
        v = lo + (hi - lo) * k / 4
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:.0f}</text>')
    for i, (name, v, col) in enumerate(items):
        x = L + i * gw + gw * 0.12
        o.append(f'<rect x="{x:.1f}" y="{py(v):.1f}" width="{gw*0.76:.1f}" height="{H-B-py(v):.1f}" fill="{col}"/>'
                 f'<text x="{x+gw*0.4:.1f}" y="{H-B+12}" text-anchor="end" transform="rotate(-50 {x+gw*0.4:.1f} {H-B+12})" font-family="sans-serif" font-size="10">{name}</text>')
    o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(ref):.1f}" y2="{py(ref):.1f}" stroke="#222" stroke-dasharray="5 4"/>'
             f'<text x="{W-R-2}" y="{py(ref)-4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">reference for-loop = {ref}</text>')
    o.append(f'<rect x="{L+10}" y="{H-16}" width="10" height="10" fill="#c0392b"/><text x="{L+25}" y="{H-7}" font-family="sans-serif" font-size="11">proposer attempts (equivalent ones)</text>'
             f'<rect x="{L+250}" y="{H-16}" width="10" height="10" fill="#1f6fb2"/><text x="{L+265}" y="{H-7}" font-family="sans-serif" font-size="11">parameter-sweep configs</text>')
    o.append("</svg>")
    (HERE / "clz16.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
