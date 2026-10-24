"""Write experiments/split.svg: one half of the two-piece hanger (M size) on a 220 mm bed, with the bolt bosses.

    python3 experiments/figure.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from hanger_split import split  # noqa: E402
from hanger_print import geom  # noqa: E402

SHAPE = dict(slope=15.92, bow=0.59, r=2.86)


def main():
    d, j = geom.Design(w=22.8, **SHAPE), split.Joint()
    ok, ang, bw, bh = split.bed_fit(d, j, 220)
    a = math.radians(ang)
    c, s_ = math.cos(a), math.sin(a)
    sc, W, H = 1.9, 520, 470
    shells = split.half_shells(d, j)
    xs = [c * x - s_ * y for sh in shells for x, y in sh["outline"]]
    ys = [s_ * x + c * y for sh in shells for x, y in sh["outline"]]
    x0, y1 = min(xs), max(ys)

    def pt(x, y):
        X, Y = c * x - s_ * y, s_ * x + c * y
        return f"{20 + (X - x0) * sc:.1f},{20 + (y1 - Y) * sc:.1f}"
    p = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d" font-family="system-ui, sans-serif" font-size="13">',
         '<title id="t">One half of the two-piece hanger on a 220 mm print bed</title>',
         f'<desc id="d">The right half of the M-size hanger turned {ang} degrees to fit a 220 millimetre square bed, with the half-depth bolt bosses and rail loop boss shaded darker.</desc>',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<rect x="20" y="20" width="{220 * sc:.0f}" height="{220 * sc:.0f}" fill="none" stroke="#999" stroke-dasharray="6 4"/>']
    for sh in shells:
        boss = sh["name"].startswith("boss")
        fill, st = ("#c0392b" if boss else "#8fb8de"), ("#7b241c" if boss else "#1f4e79")
        poly = " ".join(pt(x, y) for x, y in sh["outline"])
        if "hole" in sh:
            hole = " ".join(pt(x, y) for x, y in sh["hole"])
            p.append(f'<path fill-rule="evenodd" d="M{poly.replace(" ", " L")} Z M{hole.replace(" ", " L")} Z" fill="{fill}" stroke="{st}"/>')
        else:
            p.append(f'<polygon points="{poly}" fill="{fill}" stroke="{st}" fill-opacity="0.85"/>')
    p.append(f'<text x="30" y="{H - 14}" fill="#333">dashed: 220 mm bed. blue: full-depth arm, hub, post. red: half-depth bosses (bolts, rail loop).</text></svg>')
    (HERE / "split.svg").write_text("\n".join(p))


if __name__ == "__main__":
    main()
