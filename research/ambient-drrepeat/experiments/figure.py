"""Write experiments/selectors.svg: held-out utility/h of the four cap selectors by epsilon (uninformed prior).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
NAMES = ["ips_8r1", "ips_8r5", "dr_8r1", "dr_8r5", "biased", "hindsight"]
COLS = ["#1f6fb2", "#7fb2dd", "#c0392b", "#e6a39b", "#555555", "#2e8b57"]


def parse():
    d = {}
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"uninformed\s+(\S+)\s+(\w+)\s+(-?\d+\.\d+) \+-", l)
        if m and m.group(2) in NAMES:
            d[(m.group(1), m.group(2))] = float(m.group(3))
    return d


def main():
    d = parse(); eps = sorted({e for e, _ in d})
    W, H, L, T, B = 640, 380, 56, 40, 60
    lo, hi = -20.0, 10.0
    py = lambda v: T + (hi - v) / (hi - lo) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Held-out utility per hour of four cap selectors and two references at three exploration rates">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">Held-out utility/h, uninformed prior (mean of 20 seeds)</text>']
    for t in range(-20, 11, 10):
        o.append(f'<line x1="{L}" x2="{W-12}" y1="{py(t)}" y2="{py(t)}" stroke="#ddd"/><text x="{L-6}" y="{py(t)+4}" text-anchor="end" font-family="sans-serif" font-size="11">{t}</text>')
    gw = (W - L - 12) / len(eps); bw = gw * 0.8 / len(NAMES)
    for i, e in enumerate(eps):
        x0 = L + i * gw + gw * 0.1
        for j, n in enumerate(NAMES):
            v = d[(e, n)]; y0, y1 = sorted((py(0), py(max(v, lo))))
            o.append(f'<rect x="{x0+j*bw:.1f}" y="{y0:.1f}" width="{bw-2:.1f}" height="{y1-y0:.1f}" fill="{COLS[j]}"><title>{n} eps={e}: {v}</title></rect>')
        o.append(f'<text x="{L+(i+.5)*gw:.1f}" y="{H-B+18}" text-anchor="middle" font-family="sans-serif" font-size="12">eps = {e}</text>')
    for j, n in enumerate(NAMES):
        o.append(f'<rect x="{L+j*100}" y="{H-24}" width="10" height="10" fill="{COLS[j]}"/><text x="{L+j*100+14}" y="{H-14}" font-family="sans-serif" font-size="11">{n}</text>')
    o.append("</svg>")
    (HERE / "selectors.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
