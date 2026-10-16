"""Write experiments/pickmix.svg: share of merged projects per track, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = ["#1f6fb2", "#e08a1e"]


def parse():
    full, win, cur = {}, {}, None
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("1. "):
            cur = full
        elif l.startswith("1b. "):
            cur = win
        elif l[:2] in ("2.", "3."):
            cur = None
        elif cur is not None:
            m = re.match(r"\s(\w+)\s+\d+\s+([\d.]+)%", l)
            if m:
                cur[m.group(1)] = float(m.group(2))
    assert len(full) == 11 and len(win) == 11, (full, win)
    return full, win


def main():
    full, win = parse()
    names = list(full)
    W, H, L, R, T, B = 700, 400, 56, 16, 44, 78
    hi = 24.0
    py = lambda y: T + (1 - y / hi) * (H - T - B)
    slot = (W - L - R) / len(names)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Share of merged projects per track">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">Share of merged projects by track (dashed line: uniform, 9.1%)</text>']
    for v in range(0, 25, 4):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v}</text>')
    for i, nm in enumerate(names):
        x0 = L + i * slot + slot * 0.12
        bw = slot * 0.38
        for j, d in enumerate((full, win)):
            y = d[nm]
            o.append(f'<rect x="{x0 + j*bw:.1f}" y="{py(y):.1f}" width="{bw-1:.1f}" height="{py(0)-py(y):.1f}" fill="{COLS[j]}"/>')
        cx = L + i * slot + slot / 2
        o.append(f'<text x="{cx:.1f}" y="{H-B+16}" text-anchor="end" font-family="sans-serif" font-size="11" transform="rotate(-35 {cx:.1f} {H-B+16})">{nm}</text>')
    o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(100/11):.1f}" y2="{py(100/11):.1f}" stroke="#444" stroke-dasharray="5 4"/>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">projects (%)</text>')
    for j, lab in enumerate(["since the tracks were set (n = 218)", "since all eleven tracks existed (n = 36)"]):
        o.append(f'<rect x="{L+10}" y="{T+4+15*j}" width="12" height="10" fill="{COLS[j]}"/>'
                 f'<text x="{L+28}" y="{T+13+15*j}" font-family="sans-serif" font-size="11">{lab}</text>')
    o.append("</svg>")
    (HERE / "pickmix.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "pickmix.svg")


if __name__ == "__main__":
    main()
