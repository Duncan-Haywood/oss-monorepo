"""Dot plot from results_pglib.json: worst branch loading (% of the published rating) when the DC OPF
dispatch is run through an AC power flow, per PGLib case, typical (TYP) vs congested (API). Stdlib only.
Writes experiments/pglib_overload.svg."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = json.loads((HERE / "results_pglib.json").read_text())
cases = []
for r in rows:
    if r["case"] not in cases:
        cases.append(r["case"])
val = {}
for r in rows:
    c = r.get("mp", {}).get("check") if r["ac_ok"] and r.get("mp", {}).get("ok") else None
    if c:
        val[(r["case"], r["kind"])] = 100 * c["max_load"]

W, H, L, R, T, B = 760, 460, 150, 30, 50, 50
lo, hi = 60.0, 190.0
x = lambda v: L + (v - lo) / (hi - lo) * (W - L - R)
rowh = (H - T - B) / len(cases)
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="system-ui,sans-serif" font-size="12">',
       '<style>text{fill:#333}.g{stroke:#ccc}.typ{fill:#2a6fdb}.api{fill:#d9480f}.lim{stroke:#111;stroke-dasharray:4 3}'
       '@media (prefers-color-scheme:dark){text{fill:#ddd}.g{stroke:#555}.lim{stroke:#eee}}</style>',
       f'<text x="{L}" y="22" font-size="14" font-weight="600">DC OPF dispatch checked in AC: worst branch loading, PGLib-OPF v23.07</text>',
       f'<text x="{L}" y="40">blue = typical (TYP), orange = congested (API); missing dot = no AC solution to check</text>']
for v in range(60, 200, 20):
    out.append(f'<line class="g" x1="{x(v):.1f}" y1="{T}" x2="{x(v):.1f}" y2="{H - B}"/>')
    out.append(f'<text x="{x(v):.1f}" y="{H - B + 16}" text-anchor="middle">{v}</text>')
out.append(f'<line class="lim" x1="{x(100):.1f}" y1="{T - 4}" x2="{x(100):.1f}" y2="{H - B}"/>')
out.append(f'<text x="{x(100) + 4:.1f}" y="{T + 8}">rating</text>')
out.append(f'<text x="{(L + W - R) / 2:.0f}" y="{H - 12}" text-anchor="middle">worst branch loading, % of published rating (AC power flow of the DC dispatch)</text>')
for i, c in enumerate(cases):
    y = T + (i + 0.5) * rowh
    out.append(f'<text x="{L - 8}" y="{y + 4:.1f}" text-anchor="end">{c}</text>')
    for k, dy in (("typ", -4), ("api", 4)):
        if (c, k) in val:
            out.append(f'<circle class="{k}" cx="{x(min(val[(c, k)], hi)):.1f}" cy="{y + dy:.1f}" r="5"><title>{c} {k}: {val[(c, k)]:.1f} %</title></circle>')
out.append("</svg>")
(HERE / "pglib_overload.svg").write_text("\n".join(out) + "\n")
print("wrote pglib_overload.svg")
