"""Write experiments/crop.svg: equirect width a 360 camera needs to crop each lens natively into a 1080x1920 reel.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    rows, on = [], False
    for l in TEXT:
        if l.startswith("B. "):
            on = True
            continue
        if on and l.startswith("C. "):
            break
        m = re.match(r"(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)", l) if on else None
        if m:
            rows.append((int(m.group(1)), int(m.group(2))))
    if len(rows) < 5:
        raise SystemExit("no rows parsed")
    W, rowh, L, R, T = 640, 30, 120, 70, 56
    H = T + rowh * len(rows) + 46
    xmax = max(v for _, v in rows) * 1.08
    x = lambda v: L + (W - L - R) * v / xmax
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         'font-family="system-ui,sans-serif" font-size="13" role="img" '
         'aria-label="Equirect width needed per lens against an 8K 360 camera">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{L}" y="22" font-size="15" font-weight="600">Equirect width a 360 camera needs to crop natively</text>',
         f'<text x="{L}" y="40" fill="#555">into a 1080x1920 vertical reel, by full-frame-equivalent focal length</text>']
    for i, (f, w) in enumerate(rows):
        y = T + i * rowh
        col = "#8f5b2e" if w <= 7680 else "#c2255c"
        s.append(f'<text x="{L - 10}" y="{y + 19}" text-anchor="end">{f} mm eq</text>')
        s.append(f'<rect x="{L}" y="{y + 5}" width="{x(w) - L:.1f}" height="{rowh - 10}" fill="{col}"/>')
        s.append(f'<text x="{x(w) + 6:.1f}" y="{y + 19}" fill="#333">{w:,} px</text>')
    x8 = x(7680)
    yb = T + rowh * len(rows)
    s.append(f'<line x1="{x8:.1f}" y1="{T - 4}" x2="{x8:.1f}" y2="{yb + 4}" stroke="#222" stroke-dasharray="4 3"/>')
    s.append(f'<text x="{x8 + 4:.1f}" y="{yb + 20}" fill="#222">8K (7,680 px): native up to 24 mm eq</text>')
    s.append(f'<text x="{L}" y="{yb + 38}" fill="#555" font-size="11">Upper bound: lens sharpness, stitching and compression resolve less.</text>')
    s.append("</svg>")
    (HERE / "crop.svg").write_text("\n".join(s) + "\n")
    print("wrote crop.svg")


if __name__ == "__main__":
    main()
