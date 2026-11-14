"""Write experiments/frontcut/frontcut.svg: every design of the 33 seen conditions (grey) and the fresh ones (colour), its
closed-form salt number r_kt (x) against its DFN@100 Wh/kg over its pool's best (y), with the r_kt = -0.2 floor. Rings:
each pool's best. The floor drops everything left of the line before any DFN run.

    python experiments/frontcut/figure.py

Numbers come from urkt.jsonl, the committed benches (via run.py) and summary.json. Stdlib only.
"""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("frontcut_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)
COLOURS = ("#2b6cb0", "#2f855a", "#b7791f")


def main():
    D = run.dev_conditions()
    run._attach(D, HERE / "urkt.jsonl")
    pools = [(c, [(r["rkt"], r["score"]) for r in rows], None) for c, rows in sorted(D.items())]
    S = json.loads((HERE / "summary.json").read_text()) if (HERE / "summary.json").exists() else {"extra": {}}
    for k, (c, e) in enumerate(S["extra"].items()):
        pools.append((c, [(r["rkt"], r["score"]) for r in e["rows"]], COLOURS[k % len(COLOURS)]))
    xlo, xhi, ylo, yhi = -2.0, 1.0, 0.0, 1.0
    W, H, left, top, pw, ph = 760, 470, 60, 70, 660, 330
    X = lambda v: left + (max(xlo, min(xhi, v)) - xlo) / (xhi - xlo) * pw
    Y = lambda v: top + ph - (max(ylo, min(yhi, v)) - ylo) / (yhi - ylo) * ph
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="sans-serif" font-size="12">',
         '<style>text{fill:#222} .s{font-size:11px;fill:#555} .g{stroke:#9aa3ad} .p{fill:#9aa3ad} @media (prefers-color-scheme: dark){text{fill:#ddd} .s{fill:#aaa} .g{stroke:#5d6670} .p{fill:#6b747e}}</style>',
         '<text x="12" y="22" style="font-weight:600">Where the best electrode design sits in salt starvation: r_kt against 100-cycle DFN energy</text>',
         '<text class="s" x="12" y="38">grey: 33 seen conditions; colour: fresh (Sobol seed 13); rings: each pool\'s DFN@100 best.</text>',
         '<text class="s" x="12" y="52">Designs left of the dashed line (r_kt &lt; -0.2) are dropped before any DFN run.</text>',
         f'<rect class="g" x="{left}" y="{top}" width="{pw}" height="{ph}" fill="none"/>']
    for v in (-2, -1.5, -1, -0.5, 0, 0.5, 1):
        o.append(f'<text class="s" x="{X(v) - 8:.1f}" y="{top + ph + 16}">{v:g}</text>')
    for v in (0, 0.25, 0.5, 0.75, 1):
        o.append(f'<text class="s" x="{left - 34}" y="{Y(v) + 4:.1f}">{v:.2f}</text>')
    o.append(f'<text class="s" x="{left + pw / 2 - 120}" y="{top + ph + 36}">r_kt (closed-form minimum salt ratio; clipped at -2)</text>')
    o.append(f'<text class="s" x="{left + 6}" y="{top + 14}">y: DFN@100 Wh/kg / pool best</text>')
    o.append(f'<line x1="{X(run.TAU):.1f}" y1="{top}" x2="{X(run.TAU):.1f}" y2="{top + ph}" stroke="#c53030" stroke-dasharray="5,4" stroke-width="1.5"/>')
    rings = []
    for c, pts, col in pools:
        best = max(s for _, s in pts)
        for k, s in pts:
            fill = f'fill="{col}"' if col else 'class="p" fill-opacity="0.45"'
            o.append(f'<circle cx="{X(k):.1f}" cy="{Y(s / best):.1f}" r="{3 if col else 1.8}" {fill}/>')
        kb = max(pts, key=lambda p: p[1])[0]
        rings.append(f'<circle cx="{X(kb):.1f}" cy="{Y(1.0):.1f}" r="6" fill="none" stroke="{col or "#dd6b20"}" stroke-width="2"/>')
    o += rings
    y = H - 22
    for k, c in enumerate(S["extra"]):
        o.append(f'<circle cx="{20 + k * 200}" cy="{y - 4}" r="4" fill="{COLOURS[k % len(COLOURS)]}"/><text class="s" x="{30 + k * 200}" y="{y}">{c}</text>')
    o.append("</svg>")
    (HERE / "frontcut.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "frontcut.svg")


if __name__ == "__main__":
    main()
