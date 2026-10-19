"""Write experiments/drape.svg (M tee on stock hangers and its custom hanger, from drapes.json)
and experiments/rack.svg (error against the number of hanger widths, from results.txt).

    python3 experiments/figure.py

Numbers come from the committed outputs of run.py, never retyped.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

COL = {"wire": "#c0392b", "plastic": "#8e44ad", "wood-shaped": "#b08900", "custom": "#1f6fb2"}


def drape_svg(d):
    W, H, pad = 800, 380, 24
    names = ["wire", "plastic", "wood-shaped", "custom"]
    pw = (W - pad) / len(names)
    sc = 6.5  # px per cm
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" '
             'aria-labelledby="t d" font-family="system-ui, sans-serif" font-size="13">',
             '<title id="t">Size-M tee draped on four hangers</title>',
             '<desc id="d">Simulated shoulder line and sleeve (solid) over one hanger arm, against the '
             "worn shape (dashed). Thin-ended wire and plastic hangers fold the cloth at the tip; the "
             "custom hanger holds it close to the worn shape.</desc>",
             '<style>text{fill:#333}@media (prefers-color-scheme:dark){text{fill:#ddd}.bg{fill:#1e1e1e}}</style>',
             f'<rect class="bg" width="{W}" height="{H}" fill="#fff"/>']
    for k, n in enumerate(names):
        ox, oy = pad / 2 + k * pw + 8, 76
        tr = lambda p: f"{ox + p[0] * sc:.1f},{oy - p[1] * sc:.1f}"
        h = d[n]["h"]
        cl = " ".join(tr(p) for p in d[n]["centre"])
        parts.append(f'<polyline points="{cl}" fill="none" stroke="#999" stroke-opacity="0.55" '
                     f'stroke-width="{max(2 * h["r"] * sc, 1.5):.1f}" stroke-linecap="round"/>')
        parts.append(f'<polyline points="{" ".join(tr(p) for p in d["target"])}" fill="none" '
                     'stroke="#777" stroke-dasharray="4 3" stroke-width="1.5"/>')
        parts.append(f'<polyline points="{" ".join(tr(p) for p in d[n]["X"])}" fill="none" '
                     f'stroke="{COL[n]}" stroke-width="2.5"/>')
        parts.append(f'<text x="{ox}" y="28" font-weight="600">{n}</text>')
        parts.append(f'<text x="{ox}" y="46">w {h["w"]:.1f} cm, end r {h["r"]:.2f} cm</text>')
        parts.append(f'<text x="{ox}" y="{H - 50}">shape error {d[n]["err"]:.2f} cm RMS</text>')
        parts.append(f'<text x="{ox}" y="{H - 30}">sharpest bend {d[n]["crease"]:.0f}°/cm</text>')
    parts.append("</svg>")
    return "\n".join(parts)


def rack_series(text):
    lines = text.splitlines()
    i = next(j for j, l in enumerate(lines) if l.startswith("k  mean_err"))
    ks, mean, worst = [], [], []
    for l in lines[i + 1:]:
        m = re.match(r"(\d)\s+([\d.]+)\s+([\d.]+)", l)
        if not m:
            break
        ks.append(float(m[1])); mean.append(float(m[2])); worst.append(float(m[3]))
    cm = float(re.search(r"custom per size \(B\) mean ([\d.]+)", text)[1])
    return ks, mean, worst, cm


def main():
    d = json.loads((HERE / "drapes.json").read_text())
    (HERE / "drape.svg").write_text(drape_svg(d))
    print("wrote", HERE / "drape.svg")
    ks, mean, worst, cm = rack_series((HERE / "results.txt").read_text())
    write_lines(HERE, "rack.svg", "Hanger rack: shape error vs number of widths (tee, 7 sizes)",
                "Line plot of mean and worst shape error across seven garment sizes against the number of "
                "hanger widths a robot stocks; dashed line is a custom hanger per size",
                "number of hanger widths k", "shape error (cm RMS)",
                [("mean over sizes", ks, mean), ("worst size", ks, worst)], hline=cm)


if __name__ == "__main__":
    main()
