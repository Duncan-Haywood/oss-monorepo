"""Cheapest storage technology by duration with sourced costs. Deterministic (seeded). Writes results.txt.
Run: python experiments/run.py   (needs ../energy-lcos/src, found automatically; about 10 s)"""
import sys
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parents[1] / "energy-lcos" / "src")]
from energy_lcos import TECHS, lcos, winner  # noqa: E402
from energy_lcos_sourced import SPECS, alternatives, build, lcos_at, load, win_shares, winner_at  # noqa: E402
from energy_lcos_sourced.sourced import _fit_battery  # noqa: E402

N, SEED = 4000, 20261021
DURS = [1, 2, 4, 6, 8, 10, 12, 24, 48, 100, 168, 500]
td, atb = load()
names = list(SPECS)
short = lambda n: n.split(" (")[0][:10]
row = lambda label, vals: f"{label:>6} " + " ".join(f"{v:>10}" for v in vals)
out = []

out.append("A. LCOS ($/MWh, 7%, $30/MWh charging) with sourced 2030 costs; winner; winner in the assumed energy-lcos map")
out.append(row("hours", [short(n) for n in names] + ["sourced", "assumed"]))
for d in DURS:
    v = [lcos_at(n, td, d) for n in names]
    out.append(row(d, [f"{x:.0f}" for x in v] + [short(winner_at(td, d)), short(winner(d).name)]))

out.append("")
out.append("B. Sourced estimates behind the Monte Carlo: lowest and highest as a multiple of the 2030 value (power block, energy block)")
alts = alternatives(td, atb)
for n in names:
    a = alts[n]
    out.append(f"  {n:<24} power x{a['p'][0]:.2f} to x{a['p'][1]:.2f}   energy x{a['e'][0]:.2f} to x{a['e'][1]:.2f}")

out.append("")
out.append(f"C. Share of {N} scenarios in which each technology is cheapest (%); block costs between the lowest and highest sourced estimate, rate 3-10% and charging $10-100/MWh swept (seed {SEED})")
out.append(row("hours", [short(n) for n in names]))
sh = win_shares(td, alts, DURS, N, SEED)
for d in DURS:
    out.append(row(d, [f"{100 * sh[d][n]:.0f}" for n in names]))

out.append("")
out.append("D. Same, rate fixed at 7% and charging price at $30/MWh (only the sourced cost spread varies)")
out.append(row("hours", [short(n) for n in names]))
sh2 = win_shares(td, alts, DURS, N, SEED, rate=0.07, charge=30.0)
for d in DURS:
    out.append(row(d, [f"{100 * sh2[d][n]:.0f}" for n in names]))

out.append("")
out.append("E. Cost-year view: winner at point costs for technology-data years 2020, 2030, 2050 (no spread)")
out.append(row("hours", ["2020", "2030", "2050"]))
for d in DURS:
    out.append(row(d, [short(winner_at(td, d, year=y)) for y in (2020, 2030, 2050)]))

out.append("")
out.append("F. Cavern compressed air has no sourced spread (technology-data holds one value for 2020 to 2050). Cost multiple m on both its blocks")
out.append("   at which it stops being the point-estimate winner (rate 7%, $30/MWh); 'none' = still wins at m=10")
for d in (8, 12, 24, 100, 500):
    lo, hi = 1.0, 10.0
    f = lambda m: winner_at(td, d, p_scale=1.0) if False else None
    best_other = min(lcos_at(n, td, d) for n in names if n != "compressed air (cavern)")
    if lcos_at("compressed air (cavern)", td, d, p_scale=hi, e_scale=hi) < best_other:
        out.append(f"  {d:>4} h: none (other best ${best_other:.0f}/MWh)")
        continue
    for _ in range(60):
        mid = (lo + hi) / 2
        if lcos_at("compressed air (cavern)", td, d, p_scale=mid, e_scale=mid) < best_other:
            lo = mid
        else:
            hi = mid
    out.append(f"  {d:>4} h: m = {lo:.2f} (cavern ${lcos_at('compressed air (cavern)', td, d):.0f}/MWh, best other ${best_other:.0f}/MWh)")

out.append("")
out.append("G. Unsourced inputs (cycle life, annual fade stay at energy-lcos values): Li-ion LCOS ($/MWh) at 4 h and 8 h, base then swept")
for label, kw in (("base (6000 cycles, 1.5%/y)", {}), ("cycle life x0.5", {"cycle_life": 3000}), ("cycle life x2", {"cycle_life": 12000}),
                  ("fade 3%/y", {"fade": 0.03}), ("fade 0.5%/y", {"fade": 0.005})):
    vals = []
    for d in (4, 8):
        t = replace(build("li-ion (LFP)", td)(d), **kw)
        vals.append(lcos(t, d))
    best8 = min(lcos_at(n, td, 8) for n in names if n != "li-ion (LFP)")
    out.append(f"  {label:<28} 4 h ${vals[0]:.0f}   8 h ${vals[1]:.0f}   (best non-Li-ion at 8 h ${best8:.0f})")

out.append("")
out.append("H. Cross-check against NREL ATB 2024, Li-ion overnight capital cost ($/kW) at 2, 4, 8 h: technology-data 2030 against ATB 2030 fit")
for d in (2, 4, 8):
    t = build("li-ion (LFP)", td)(d)
    cells = []
    for sc in ("Advanced", "Moderate", "Conservative"):
        p, e = _fit_battery(atb, sc, 2030)
        cells.append(f"{sc} {p + e * d:.0f}")
    out.append(f"  {d} h: technology-data {t.power_cost + t.energy_cost * d:.0f}; ATB " + ", ".join(cells))

Path(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
