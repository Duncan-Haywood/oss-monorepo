"""Write experiments/best_design.svg: best systolic array vs best MAC-lane engine per layer width F.

    python experiments/figure.py

Parsed from the committed results.txt (never retyped). Metric: cells*cycles/vec, lower is better.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROW = re.compile(r"^\s*(\d+)\s+(systolic|mac-lane)\s+\S+\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)")


def best():
    out = {}
    for line in (HERE / "results.txt").read_text().splitlines():
        m = ROW.match(line)
        if m:
            f, kind, metric = int(m[1]), m[2], int(m[6])
            d = out.setdefault(f, {})
            d[kind] = min(metric, d.get(kind, metric))
    return out


def main():
    b = best()
    fs = sorted(b)
    W, H, L, R, T, B = 560, 340, 70, 16, 40, 50
    top = max(v for d in b.values() for v in d.values()) * 1.12
    py = lambda v: T + (1 - v / top) * (H - T - B)
    cols = {"systolic": "#c0392b", "mac-lane": "#1f6fb2"}
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Grouped bars: best systolic array and best MAC-lane engine, cells times cycles per vector, by layer width F">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">Best design by cells&#215;cycles per vector (lower is better)</text>']
    for k in range(5):
        v = top * k / 4.4
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:,.0f}</text>')
    gw = (W - L - R) / len(fs)
    for i, f in enumerate(fs):
        for j, kind in enumerate(("systolic", "mac-lane")):
            v = b[f].get(kind)
            if v is None:
                continue
            x = L + i * gw + gw * (0.15 + 0.35 * j)
            o.append(f'<rect x="{x:.1f}" y="{py(v):.1f}" width="{gw*0.33:.1f}" height="{H-B-py(v):.1f}" fill="{cols[kind]}"/>'
                     f'<text x="{x+gw*0.165:.1f}" y="{py(v)-4:.1f}" text-anchor="middle" font-family="sans-serif" font-size="10">{v:,}</text>')
        o.append(f'<text x="{L+(i+0.5)*gw:.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">F = {f}</text>')
    for j, kind in enumerate(("systolic", "mac-lane")):
        o.append(f'<rect x="{L+10+110*j}" y="{H-18}" width="10" height="10" fill="{cols[kind]}"/>'
                 f'<text x="{L+25+110*j}" y="{H-9}" font-family="sans-serif" font-size="11">best {kind}</text>')
    o.append("</svg>")
    (HERE / "best_design.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
