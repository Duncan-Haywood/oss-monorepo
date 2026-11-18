"""Write experiments/measured/measured.svg: voltage against discharged capacity, measured and modelled, one panel per condition.

    python experiments/measured/figure.py

Reads the committed bench.jsonl (thinned curves) and summary.json. Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
COL = {"SPM": "#9a9a9a", "SPMe": "#d1883a", "DFN": "#5b8fd1"}


def main():
    rows = [json.loads(x) for x in (HERE / "bench.jsonl").read_text().splitlines()]
    S = json.loads((HERE / "summary.json").read_text())["conditions"]
    import run as R
    pw, ph, gx, gy, cols = 300, 190, 70, 76, 3
    W = cols * (pw + gx) + 20
    H = 2 * (ph + gy) + 80
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="11">',
         '<style>text{fill:#333}.s{font-size:10px}@media (prefers-color-scheme:dark){text{fill:#ddd}}</style>',
         '<text x="12" y="20" style="font-weight:600;font-size:13px">Measured discharges (dots) against SPM, SPMe and DFN '
         '(PyBaMM 26.10.1.1, shipped parameter sets)</text>']
    lx = 12
    for m in R.MODELS:
        o.append(f'<line x1="{lx}" y1="36" x2="{lx + 20}" y2="36" stroke="{COL[m]}" stroke-width="2"/>'
                 f'<text x="{lx + 24}" y="40">{m}</text>')
        lx += 80
    o.append(f'<circle cx="{lx + 6}" cy="36" r="2.5" fill="#222"/><text x="{lx + 14}" y="40">measured</text>')
    for k, (cell, crate, _) in enumerate(R.CONDITIONS):
        name = R.label(cell, crate)
        x0 = 50 + (k % cols) * (pw + gx)
        y0 = 84 + (k // cols) * (ph + gy)
        cur = crate * R.NOMINAL_AH[cell]
        meas = next(r for r in rows if r.get("kind") == "measured" and r["cell"] == cell and r["crate"] == crate)
        curves = {"meas": ([t * cur / 3600 for t in meas["t_keep"]], meas["v_keep"])}
        for m in R.MODELS:
            r = next(r for r in rows if r.get("kind") != "measured" and r["cell"] == cell and r["crate"] == crate and r["model"] == m)
            curves[m] = ([t * cur / 3600 for t in r["t_keep"]], r["v_keep"])
        qmax = max(max(q) for q, _ in curves.values())
        vlo, vhi = R.MODEL_CUT[cell] - 0.05, 4.25
        sx = lambda q: x0 + pw * q / qmax
        sy = lambda v: y0 + ph * (vhi - min(max(v, vlo), vhi)) / (vhi - vlo)
        o.append(f'<rect x="{x0}" y="{y0}" width="{pw}" height="{ph}" fill="none" stroke="#999"/>')
        for m in R.MODELS:
            q, v = curves[m]
            pts = " ".join(f"{sx(a):.1f},{sy(b):.1f}" for a, b in zip(q, v))
            o.append(f'<polyline points="{pts}" fill="none" stroke="{COL[m]}" stroke-width="1.6"/>')
        q, v = curves["meas"]
        step = max(1, len(q) // 40)
        for a, b in list(zip(q, v))[::step]:
            o.append(f'<circle cx="{sx(a):.1f}" cy="{sy(b):.1f}" r="2" fill="#222"/>')
        vc = R.V_CUT[cell]
        o.append(f'<line x1="{x0}" y1="{sy(vc):.1f}" x2="{x0 + pw}" y2="{sy(vc):.1f}" stroke="#888" stroke-dasharray="3,3"/>')
        c = S[name]
        o.append(f'<text x="{x0}" y="{y0 - 20}" style="font-weight:600">{name}</text>'
                 f'<text class="s" x="{x0}" y="{y0 - 6}">capacity error SPMe {c["SPMe"]["err"]:+.1%}, '
                 f'DFN {c["DFN"]["err"]:+.1%}; SPMe r_min {c["SPMe"]["r_min"]:.2f}</text>')
        for vv in (vlo + 0.05, 3.5, 4.0):
            o.append(f'<text class="s" x="{x0 - 4}" y="{sy(vv) + 3:.1f}" text-anchor="end">{vv:.1f}</text>')
        o.append(f'<text class="s" x="{x0}" y="{y0 + ph + 13}">0</text>'
                 f'<text class="s" x="{x0 + pw}" y="{y0 + ph + 13}" text-anchor="end">{qmax:.3g} Ah</text>')
    o.append(f'<text class="s" x="12" y="{H - 12}">Voltage [V] against discharged capacity [Ah]. Dashed line: the capacity cut-off V_cut. '
             'Measured data: pybamm-data v1.0.2 (Ecker et al. 2015; Ai et al. 2020).</text>')
    o.append("</svg>")
    (HERE / "measured.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(HERE))
    main()
