"""calmap.svg: per fresh pool, Spearman of each fade list with the 100-cycle DFN Wh/kg: raw cycle-10 energy, 5n's sqrt
energy fit, the map with the uncorrected law (5u), the map with the frozen self-limiting correction (5v), the map fed DFN's own
loss, and the map fed that loss with a 10% lognormal error (summary.json). Stdlib only."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SER = (("rho_raw", "#adb5bd", "raw cycle 10"), ("rho_sqrt", "#495057", "5n sqrt fit"), ("rho_law", "#d9480f", "map, 5u law"),
       ("rho_corr", "#2a6fdb", "map, corrected"), ("rho_true_map", "#2f9e44", "map, true loss"),
       ("rho_noisy", "#ae3ec9", "true loss \u00b110%"))


def main():
    s = json.loads((HERE / "summary.json").read_text())
    conds = list(s["conditions"])
    W, rowh, top, left, right = 720, 30, 80, 200, 30
    H = top + rowh * len(conds) + 50
    sx = lambda v: left + (v + 1) / 2 * (W - left - right)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W / 2}" y="22" text-anchor="middle" font-weight="bold">Ranking 100-cycle DFN energy from ten cycles, three fresh Ai2020 pools (seed 15)</text>']
    for t in (-1, -0.5, 0, 0.5, 1):
        o += [f'<line x1="{sx(t)}" y1="{top - 10}" x2="{sx(t)}" y2="{H - 40}" stroke="#ddd"/>',
              f'<text x="{sx(t)}" y="{H - 26}" text-anchor="middle">{t:g}</text>']
    o.append(f'<text x="{(left + W - right) / 2}" y="{H - 8}" text-anchor="middle">Spearman with DFN Wh/kg at cycle 100</text>')
    for k, (key, col, name) in enumerate(SER):
        x0 = 14 + 118 * k
        o += [f'<circle cx="{x0}" cy="48" r="5" fill="{col}"/>', f'<text x="{x0 + 9}" y="52">{name}</text>']
    for i, c in enumerate(conds):
        y = top + rowh * i + rowh / 2
        d = s["conditions"][c]
        o.append(f'<text x="{left - 8}" y="{y + 4}" text-anchor="end">{c} (n = {d["n"]})</text>')
        vals = [d[k] for k, _, _ in SER]
        o.append(f'<line x1="{sx(min(vals))}" y1="{y}" x2="{sx(max(vals))}" y2="{y}" stroke="#bbb"/>')
        for (key, col, _), v in zip(SER, vals):
            o.append(f'<circle cx="{sx(v):.1f}" cy="{y}" r="5" fill="{col}" fill-opacity="0.85"/>')
    o.append("</svg>")
    (HERE / "calmap.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
