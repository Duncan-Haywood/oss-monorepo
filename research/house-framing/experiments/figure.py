"""Write experiments/ablation.svg: board feet each OVE measure saves when added alone to conventional 2x6 framing (experiment B).

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
        m = re.match(r"(\S.*?)\s{2,}([+-]\d+)\s+[+-][\d.]+\s+[+-][\d.]+\s+[+-]\d+", l) if on else None
        if m:
            rows.append((m.group(1), -int(m.group(2))))
    total = re.search(r"advanced vs conventional 2x6: board feet ([+-][\d.]+)%", "\n".join(TEXT))
    if len(rows) < 5 or not total:
        raise SystemExit("no rows parsed")
    W, rowh, L, R, T = 640, 26, 190, 60, 52
    H = T + rowh * len(rows) + 40
    xmax = max(v for _, v in rows) * 1.15
    px = lambda v: L + v / xmax * (W - L - R)
    f = 'font-family="sans-serif"'
    alt = ("Bar chart of lumber saved by each advanced-framing measure applied alone to conventional 2x6 walls on a 28 by 40 ft house: "
           + ", ".join(f"{n} {v} board feet" for n, v in rows))
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Board feet saved by each OVE measure alone (all together: {total.group(1).lstrip("-")}% less)</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">exterior walls, 28 x 40 ft one-storey house, vs conventional 2x6 @ 16 in</text>']
    for i, (n, v) in enumerate(rows):
        y = T + i * rowh
        o.append(f'<text x="{L-8}" y="{y+16}" text-anchor="end" {f} font-size="12">{n}</text>')
        if v > 0:
            o.append(f'<rect x="{L}" y="{y+4}" width="{px(v)-L:.1f}" height="{rowh-8}" fill="#b5651d"/>')
        o.append(f'<text x="{px(max(v, 0))+6:.1f}" y="{y+16}" {f} font-size="11">{v}</text>')
    o.append(f'<line x1="{L}" x2="{L}" y1="{T}" y2="{T+rowh*len(rows)}" stroke="#333"/>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-12}" text-anchor="middle" {f} font-size="12">board feet saved (10% waste included)</text>')
    o.append("</svg>")
    (HERE / "ablation.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "ablation.svg")


if __name__ == "__main__":
    main()
