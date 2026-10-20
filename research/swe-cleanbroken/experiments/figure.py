"""Write experiments/windows.svg: share of overlapping-commit pairs that conflict, by window (as in results.txt).

    python experiments/figure.py

The numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
COLS = ["#c0392b", "#2e8b57", "#e67e22"]


def parse():
    rows = []
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"\s*(\d+)\s+(\d+)\s+(\d+) \(\s*([\d.]+)%\)\s+(\d+) \(\s*([\d.]+)%\)\s+(\d+) \(\s*([\d.]+)%\)", l)
        if m:
            rows.append((int(m.group(1)), int(m.group(2)), float(m.group(4)), float(m.group(6)), float(m.group(8))))
    return rows


def svg(rows):
    W, H, L0, R, T, B = 640, 380, 64, 16, 40, 64
    series = [(2, "conflict"), (3, "clean and consistent"), (4, "clean but broken")]
    py = lambda y: T + (1 - y / 100) * (H - T - B)
    alt = "Share of commit pairs by outcome for 10, 30 and 60 minute windows: conflict, clean and consistent, clean but broken"
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">Outcome of merging two commits made within a window</text>']
    for i in range(6):
        v = 20 * i
        o.append(f'<line x1="{L0}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L0-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v}</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">share of pairs (%)</text>')
    gw = (W - L0 - R) / len(rows)
    bw = gw * 0.8 / 3
    for gi, r in enumerate(rows):
        x0 = L0 + gi * gw + gw * 0.1
        for si, (k, _) in enumerate(series):
            v = r[k]
            x = x0 + si * bw
            o.append(f'<rect x="{x:.1f}" y="{py(v):.1f}" width="{bw-3:.1f}" height="{py(0)-py(v):.1f}" fill="{COLS[si]}"/>'
                     f'<text x="{x+(bw-3)/2:.1f}" y="{py(v)-4:.1f}" text-anchor="middle" font-family="sans-serif" font-size="10">{v:.1f}</text>')
        o.append(f'<text x="{L0+gi*gw+gw/2:.1f}" y="{H-B+18}" text-anchor="middle" font-family="sans-serif" font-size="12">{r[0]} min window ({r[1]} pairs)</text>')
    for si, (_, name) in enumerate(series):
        o.append(f'<rect x="{L0+10+si*150}" y="{H-24}" width="12" height="10" fill="{COLS[si]}"/>'
                 f'<text x="{L0+26+si*150}" y="{H-15}" font-family="sans-serif" font-size="11">{name}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


def main():
    rows = parse()
    assert len(rows) == 3, rows
    (HERE / "windows.svg").write_text(svg(rows))
    print("wrote", HERE / "windows.svg")


if __name__ == "__main__":
    main()
