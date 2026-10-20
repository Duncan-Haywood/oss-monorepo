"""Write experiments/lines.svg: leave-one-line-out hit rate for each source line, parsed from the "Per line" block of results.txt.

    python experiments/figure.py

The numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent


def main():
    rows = []
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"\s*line\s+(\d+): n=(\d+) (\w+)\s+hits (\d+)/(\d+)", l)
        if m:
            rows.append((int(m.group(1)), int(m.group(2)), int(m.group(4))))
    assert len(rows) == 11, rows
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 64
    py = lambda y: T + (1 - y) * (H - T - B)
    gw = (W - L - R) / len(rows)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Leave-one-line-out hit rate for each of 11 source lines; 25 of 27 survivors are predicted correctly">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">Leave-one-line-out hit rate per source line (25/27 overall)</text>']
    for i in range(6):
        v = i / 5
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:.1f}</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">hit rate</text>')
    for i, (line, n, hits) in enumerate(rows):
        x = L + i * gw + gw * 0.15
        v = hits / n
        col = "#2e8b57" if hits == n else "#c0392b"
        o.append(f'<rect x="{x:.1f}" y="{py(v):.1f}" width="{gw*0.7:.1f}" height="{max(py(0)-py(v), 1):.1f}" fill="{col}"/>'
                 f'<text x="{x+gw*0.35:.1f}" y="{py(v)-4:.1f}" text-anchor="middle" font-family="sans-serif" font-size="10">{hits}/{n}</text>'
                 f'<text x="{x+gw*0.35:.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{line}</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-30}" text-anchor="middle" font-family="sans-serif" font-size="12">source line (label under bar; hits/survivors above)</text>')
    o.append("</svg>")
    (HERE / "lines.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "lines.svg")


if __name__ == "__main__":
    main()
