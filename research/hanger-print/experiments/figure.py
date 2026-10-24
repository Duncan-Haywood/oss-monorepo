"""Write experiments/rack.svg: the four-width rack as printed outlines (frontal view, to scale), and
experiments/stiffness.svg: safety factor against end radius from results.txt section B.

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from hanger_print import geom  # noqa: E402
from linefig import table, write_lines  # noqa: E402

SHAPE = dict(slope=15.92, bow=0.59, r=2.86)
RACK = [16, 19, 22, 25]
COL = ["#2e8b57", "#1f6fb2", "#8e44ad", "#c0392b"]


def rack_svg():
    W, H, s = 760, 250, 1.45   # px per mm
    ox, oy = W / 2, 70
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d" '
             'font-family="system-ui, sans-serif" font-size="13">',
             '<title id="t">The four-width hanger rack as printed outlines</title>',
             '<desc id="d">Frontal outlines of the hanger at arm lengths 16, 19, 22 and 25 centimetres, '
             'sharing one arm shape, drawn to scale and overlaid on the hook.</desc>',
             f'<rect width="{W}" height="{H}" fill="#fff"/>']
    for w, c in zip(RACK, COL):
        d = geom.Design(w=w, **SHAPE)
        for mirror in (False, True):
            pts = geom.arm_outline(d, mirror=mirror)
            path = " ".join(f"{ox + x * s:.1f},{oy - y * s:.1f}" for x, y in pts)
            parts.append(f'<polygon points="{path}" fill="{c}" fill-opacity="0.12" stroke="{c}" stroke-width="1.6"/>')
    for i, (w, c) in enumerate(zip(RACK, COL)):
        parts.append(f'<text x="{14 + i * 120}" y="{H - 12}" fill="{c}">w = {w} cm</text>')
    parts.append(f'<circle cx="{ox}" cy="{oy - geom.POST_H * s:.1f}" r="{geom.LOOP_RO * s:.1f}" fill="none" stroke="#444" stroke-width="1.6"/>')
    parts.append("</svg>")
    (HERE / "rack.svg").write_text("\n".join(parts))


def stiffness_svg():
    text = (HERE / "results.txt").read_text().splitlines()
    xs, (sf,) = table(text, "== B.", 0, [1])
    write_lines(HERE, "stiffness.svg", "Safety factor of a printed arm against its end radius",
                "Safety factor of a 12 mm deep printed arm (1.5 kg garment) against the end radius; arms with an "
                "end radius under about 0.6 cm are below 1",
                "end radius r (cm)", "safety factor at 12 mm depth (log scale)",
                [("safety factor", xs, sf)], logy=True, hline=1.0)


if __name__ == "__main__":
    rack_svg()
    stiffness_svg()
