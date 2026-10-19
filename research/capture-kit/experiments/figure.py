"""Write experiments/kit.svg: variety against weight budget, exact vs greedy (floor of 4 h). Parses results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    rows, on = [], False
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("B. "):
            on = True
            continue
        if l.startswith("C. "):
            break
        m = re.match(r"(\d+)\s+(\d+)\s+[\d.]+\s+\d+\s+(\d+)\s+([\d.]+)\s+\d+\s+(True|False)", l) if on else None
        if m:
            rows.append((int(m[1]), int(m[2]), int(m[3]), m[5] == "True"))
    if len(rows) < 6:
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 640, 320, 56, 20, 60, 50
    xs = lambda i: L + (W - L - R) * i / (len(rows) - 1)
    ys = lambda v: H - B - (H - B - T) * v / 18
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="system-ui,sans-serif" font-size="12" role="img" aria-label="Shot variety against carried weight, exact search and greedy">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{L}" y="22" font-size="15" font-weight="600">Shot variety a travel kit reaches, by weight carried</text>',
         f'<text x="{L}" y="40" fill="#555">exact search (dark) vs greedy (pink; hollow = misses the 4 h floor); 18 = every band at every viewpoint</text>']
    for v in (0, 6, 12, 18):
        s.append(f'<line x1="{L}" y1="{ys(v):.1f}" x2="{W - R}" y2="{ys(v):.1f}" stroke="#ddd"/><text x="{L - 8}" y="{ys(v) + 4:.1f}" text-anchor="end">{v}</text>')
    for name, idx, col in (("exact", 1, "#8f5b2e"), ("greedy", 2, "#c2255c")):
        pts = " ".join(f"{xs(i):.1f},{ys(r[idx]):.1f}" for i, r in enumerate(rows))
        s.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="2"/>')
        for i, r in enumerate(rows):
            fill = col if (idx == 1 or r[3]) else "#fff"
            s.append(f'<circle cx="{xs(i):.1f}" cy="{ys(r[idx]):.1f}" r="4" fill="{fill}" stroke="{col}" stroke-width="2"/>')
    for i, r in enumerate(rows):
        s.append(f'<text x="{xs(i):.1f}" y="{H - B + 18}" text-anchor="middle">{r[0] / 1000:g} kg</text>')
    s.append(f'<text x="{L}" y="{H - 10}" fill="#555" font-size="11">Assumed device figures; see README. Variety counts shots, not their quality.</text></svg>')
    (HERE / "kit.svg").write_text("\n".join(s) + "\n")
    print("wrote kit.svg")


if __name__ == "__main__":
    main()
