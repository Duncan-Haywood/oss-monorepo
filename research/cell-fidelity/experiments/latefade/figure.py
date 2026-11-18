"""Write experiments/latefade/latefade.svg: per fresh condition, two scatters of every design's DFN@100 Wh/kg (y) against
its raw cycle-10 Wh/kg (left) and its sqrt(cycle) extrapolation of cycles 5 to 10 to cycle 100 (right). Blue: the top 4 by
the raw energy; green: the top 4 by the extrapolation; orange ring: the pool's DFN best.

    python experiments/latefade/figure.py

Numbers come from the committed summary.json (its per-design rows) and run.py's extrapolation. Stdlib only.
"""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("latefade_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def main():
    S = json.loads((HERE / "summary.json").read_text())
    conds = [c for c in S["kept"] if c in S["extra"]]
    pw, ph, gap, top, left = 190, 190, 46, 92, 56
    W = left + len(conds) * 2 * (pw + gap) + 10
    H = top + ph + 64
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="sans-serif" font-size="12">',
         '<style>text{fill:#222} .s{font-size:11px;fill:#555} .g{stroke:#9aa3ad} .p{fill:#9aa3ad} @media (prefers-color-scheme: dark){text{fill:#ddd} .s{fill:#aaa} .g{stroke:#5d6670} .p{fill:#6b747e}}</style>',
         '<text x="12" y="22" style="font-weight:600">Reading late fade off ten DFN cycles: raw cycle-10 energy against a sqrt(cycle) extrapolation (fresh conditions, Sobol seed 12)</text>',
         '<text class="s" x="12" y="40">y: DFN@100 Wh/kg. blue: top 4 by raw cycle-10 Wh/kg; green: top 4 by the extrapolation; orange ring: pool best. The screen resumes the union to cycle 100.</text>']
    k = 0
    for c in conds:
        rows = S["extra"][c]["rows"]
        sc = [r["score"] for r in rows]
        raw = [r["wh_kg"][run.K - 1] for r in rows]
        ext = [run.extrapolate(r["wh_kg"]) for r in rows]
        idx = range(len(rows))
        top_raw, top_ext = set(run.ranked(raw, idx)[:run.M]), set(run.ranked(ext, idx)[:run.M])
        best = max(idx, key=lambda i: sc[i])
        cc = S["conditions"][c]
        for label, xs, rho, hi in (("raw cycle-10 Wh/kg", raw, cc["rho_raw10"], top_raw),
                                   ("sqrt-extrapolated cycle-100 Wh/kg", ext, cc["rho_ext10"], top_ext)):
            x0 = left + k * (pw + gap)
            k += 1
            xlo, xhi = min(xs), max(xs)
            ylo, yhi = min(sc), max(sc)
            dx, dy = (xhi - xlo) or 1, (yhi - ylo) or 1
            X = lambda v: x0 + (v - xlo) / dx * pw
            Y = lambda v: top + ph - (v - ylo) / dy * ph
            o.append(f'<rect class="g" x="{x0}" y="{top}" width="{pw}" height="{ph}" fill="none"/>')
            o.append(f'<text x="{x0}" y="{top - 22}" style="font-weight:600">{c}</text>')
            o.append(f'<text class="s" x="{x0}" y="{top - 8}">Spearman {rho:+.2f}</text>')
            o.append(f'<text class="s" x="{x0}" y="{top + ph + 18}">{label}</text>')
            o.append(f'<text class="s" x="{x0}" y="{top + ph + 34}">{xlo:.0f} to {xhi:.0f}; y {ylo:.0f} to {yhi:.0f}</text>')
            for i in idx:
                cls = 'fill="#2b6cb0"' if i in top_raw and xs is raw else 'fill="#2f855a"' if i in top_ext and xs is ext else 'class="p"'
                r = 4 if 'class' not in cls else 2.5
                o.append(f'<circle cx="{X(xs[i]):.1f}" cy="{Y(sc[i]):.1f}" r="{r}" {cls}/>')
            o.append(f'<circle cx="{X(xs[best]):.1f}" cy="{Y(sc[best]):.1f}" r="7" fill="none" stroke="#dd6b20" stroke-width="2"/>')
        _ = hi
    o.append(f'<text class="s" x="12" y="{H - 8}">Each union resumes at most 8 of 64 designs to 100 cycles; outcome in results.txt and LOG.md.</text>')
    o.append("</svg>")
    (HERE / "latefade.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "latefade.svg")


if __name__ == "__main__":
    main()
