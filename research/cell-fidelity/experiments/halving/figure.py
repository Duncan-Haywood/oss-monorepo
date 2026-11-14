"""Write experiments/halving/halving.svg: one panel per fresh condition, every design's Wh/kg over its 100 cycles, the rungs
at 10, 20 and 50 cycles marked, the designs the ladder carried to cycle 100 in green and the pool's DFN best in orange.

    python experiments/halving/figure.py

Numbers come from the committed summary.json (its per-design rows). Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    S = json.loads((HERE / "summary.json").read_text())
    conds = [c for c in S["kept"] if c in S["extra"]]
    pw, ph, gap, top, left = 260, 220, 50, 64, 60
    W = left + len(conds) * (pw + gap) + 10
    H = top + ph + 60
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="sans-serif" font-size="12">',
         '<style>text{fill:#222} .s{font-size:11px;fill:#555} .g{stroke:#9aa3ad} @media (prefers-color-scheme: dark){text{fill:#ddd} .s{fill:#aaa} .g{stroke:#5d6670}}</style>',
         '<text x="12" y="22" style="font-weight:600">Where fade keeps growing after cycle 10: successive halving over resumed DFN runs (fresh conditions, Sobol seed 11)</text>',
         '<text class="s" x="12" y="40">grey: every design\'s Wh/kg by cycle; dashed: rungs (64 designs to 10, 16 to 20, 8 to 50, 3 to 100); green: the 3 carried to 100; orange: pool best</text>']
    for n, c in enumerate(conds):
        rows = S["extra"][c]["rows"]
        cc = S["conditions"][c]
        x0 = left + n * (pw + gap)
        ys = [v for r in rows for v in r["wh_kg"]]
        ylo, yhi = min(ys) * 0.97, max(ys) * 1.03
        X = lambda k: x0 + (k - 1) / 99 * pw
        Y = lambda v: top + ph - (v - ylo) / (yhi - ylo) * ph
        o.append(f'<rect x="{x0}" y="{top}" width="{pw}" height="{ph}" fill="none" stroke="#888"/>')
        for k in (10, 20, 50):
            o.append(f'<line x1="{X(k):.1f}" y1="{top}" x2="{X(k):.1f}" y2="{top + ph}" stroke="#888" stroke-dasharray="3 3"/>')
            o.append(f'<text class="s" x="{X(k) - 6:.1f}" y="{top + ph + 16}">{k}</text>')
        best = max(rows, key=lambda r: r["score"])["j"]

        def path(r):
            return " ".join(f"{'M' if i == 0 else 'L'}{X(i + 1):.1f},{Y(v):.1f}" for i, v in enumerate(r["wh_kg"]))
        for r in rows:
            if r["j"] not in cc["picked"] and r["j"] != best:
                o.append(f'<path class="g" d="{path(r)}" fill="none" stroke-width="0.7" stroke-opacity="0.6"/>')
        for r in rows:
            if r["j"] in cc["picked"]:
                o.append(f'<path d="{path(r)}" fill="none" stroke="#2f7d4f" stroke-width="2"/>')
        for r in rows:
            if r["j"] == best:
                o.append(f'<path d="{path(r)}" fill="none" stroke="#d08a00" stroke-width="2" stroke-dasharray="{"5 3" if best in cc["picked"] else "0"}"/>')
        o.append(f'<text x="{x0}" y="{top - 22}" style="font-weight:600">{c}</text>')
        o.append(f'<text class="s" x="{x0}" y="{top - 7}">ladder gap {100 * cc["gap"]:.1f}% at {cc["t_ratio"]:.2f} of all-DFN; DFN@10 top 3 gap {100 * cc["fixed10"]["gap"]:.1f}%</text>')
        o.append(f'<text class="s" x="{x0 + pw / 2 - 20}" y="{top + ph + 32}">cycle</text>')
        o.append(f'<text class="s" x="{x0 - 4}" y="{top + 10}" text-anchor="end">{yhi:.0f}</text><text class="s" x="{x0 - 4}" y="{top + ph}" text-anchor="end">{ylo:.0f}</text>')
    o.append(f'<text class="s" x="12" y="{top + ph / 2 + 30}" transform="rotate(-90 12 {top + ph / 2 + 30})">Wh/kg</text>')
    o.append('</svg>')
    (HERE / "halving.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "halving.svg")


if __name__ == "__main__":
    main()
