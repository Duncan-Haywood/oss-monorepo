"""Write experiments/stagger.svg: redundant-run share against start gap, parsed from results.txt.

    python experiments/figure.py

The numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = ["#1f6fb2", "#c0392b"]


def parse():
    series, cur = {}, None
    sec = False
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("4. "):
            sec = True
        elif sec and l.startswith("5. "):
            break
        elif sec:
            m = re.match(r" claim latency mean (\d+) min", l)
            if m:
                cur = int(m.group(1)); series[cur] = []
                continue
            m = re.match(r"\s*g=(\d+)\s+([\d.]+)% runs", l)
            if m and cur is not None:
                series[cur].append((int(m.group(1)), float(m.group(2))))
    assert set(series) == {3, 10} and all(len(v) == 6 for v in series.values()), series
    return series


def main():
    series = parse()
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 56
    xs = [g for g, _ in series[3]]
    px = lambda g: L + g / max(xs) * (W - L - R)
    hi = 14.0
    py = lambda y: T + (1 - y / hi) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Redundant runs against start gap">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">Redundant runs vs start gap (4 runs, 11 items; assumed timings)</text>']
    for v in range(0, 15, 2):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v}</text>')
    for g in xs:
        o.append(f'<text x="{px(g):.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{g}</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-12}" text-anchor="middle" font-family="sans-serif" font-size="12">gap between starts (minutes)</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">runs redundant (%)</text>')
    for j, (lat, pts) in enumerate(sorted(series.items())):
        d = " ".join(f"{px(g):.1f},{py(y):.1f}" for g, y in pts)
        o.append(f'<polyline points="{d}" fill="none" stroke="{COLS[j]}" stroke-width="2"/>')
        for g, y in pts:
            o.append(f'<circle cx="{px(g):.1f}" cy="{py(y):.1f}" r="3" fill="{COLS[j]}"/>')
        ly = T + 10 + 15 * j
        o.append(f'<rect x="{W-R-190}" y="{ly-8}" width="12" height="10" fill="{COLS[j]}"/>'
                 f'<text x="{W-R-172}" y="{ly+1}" font-family="sans-serif" font-size="11">claim visible after mean {lat} min</text>')
    o.append("</svg>")
    (HERE / "stagger.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "stagger.svg")


if __name__ == "__main__":
    main()
