"""losslaw.svg: per test condition, Spearman of each fade list with the 100-cycle DFN Wh/kg: 5n's sqrt energy fit,
5s's power-law map and 5t's sqrt-law map (summary.json). Stdlib only."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SER = (("rho_sqrt", "#868e96", "5n: sqrt-cycle energy fit"), ("rho_map", "#d9480f", "5s: map + power-law lithium"),
       ("rho_law", "#2a6fdb", "5t: map + a + b√n lithium"))


def main():
    s = json.loads((HERE / "summary.json").read_text())
    conds = [c for c in s["test"] if c in s["conditions"]]
    W, rowh, top, left, right = 640, 22, 70, 150, 30
    H = top + rowh * len(conds) + 50
    sx = lambda v: left + (v + 1) / 2 * (W - left - right)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W / 2}" y="22" text-anchor="middle" font-weight="bold">Ranking the 100-cycle DFN energy from ten cycles (13 test pools)</text>']
    for t in (-1, -0.5, 0, 0.5, 1):
        o += [f'<line x1="{sx(t)}" y1="{top - 8}" x2="{sx(t)}" y2="{H - 40}" stroke="#ddd"/>',
              f'<text x="{sx(t)}" y="{H - 26}" text-anchor="middle">{t:g}</text>']
    o.append(f'<text x="{(left + W - right) / 2}" y="{H - 8}" text-anchor="middle">Spearman with DFN Wh/kg at cycle 100</text>')
    for k, (key, col, name) in enumerate(SER):
        o += [f'<circle cx="{60 + 195 * k}" cy="44" r="5" fill="{col}"/>', f'<text x="{69 + 195 * k}" y="48">{name}</text>']
    for i, c in enumerate(conds):
        y = top + rowh * i + rowh / 2
        d = s["conditions"][c]
        o.append(f'<text x="{left - 8}" y="{y + 4}" text-anchor="end">{c}</text>')
        vals = [d[k] for k, _, _ in SER]
        o.append(f'<line x1="{sx(min(vals))}" y1="{y}" x2="{sx(max(vals))}" y2="{y}" stroke="#bbb"/>')
        for (key, col, _), v in zip(SER, vals):
            o.append(f'<circle cx="{sx(v):.1f}" cy="{y}" r="5" fill="{col}"/>')
    o.append("</svg>")
    (HERE / "losslaw.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
