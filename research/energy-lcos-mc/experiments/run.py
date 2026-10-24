"""Monte Carlo robustness of the energy-lcos winner map. Deterministic (seeded). Writes results.txt.
Run: python experiments/run.py   (needs ../energy-lcos/src, found automatically)"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parents[1] / "energy-lcos" / "src")]
from energy_lcos import TECHS, winner  # noqa: E402
from energy_lcos_mc import win_shares, one_at_a_time  # noqa: E402

N, SEED = 4000, 20261020
DURS = [1, 2, 4, 6, 8, 10, 12, 24, 48, 100, 168, 500]
names = list(TECHS)
short = lambda n: n.split(" (")[0][:10]
row = lambda label, vals: f"{label:>6} " + " ".join(f"{v:>10}" for v in vals)
out = []

out.append(f"A. Share of {N} scenarios in which each technology is cheapest (%), all inputs, rate and charging price varied (seed {SEED})")
out.append(row("hours", [short(n) for n in names] + ["base win"]))
sh = win_shares(DURS, N, SEED)
for d in DURS:
    out.append(row(d, [f"{100 * sh[d][n]:.0f}" for n in names] + [short(winner(d).name)]))

out.append("")
out.append("B. Same, rate fixed at 7% and charging price at $30/MWh (only technology inputs vary)")
out.append(row("hours", [short(n) for n in names]))
sh2 = win_shares(DURS, N, SEED, rate=0.07, charge=30.0)
for d in DURS:
    out.append(row(d, [f"{100 * sh2[d][n]:.0f}" for n in names]))

out.append("")
out.append("C. Duration at which the base winner has under 50% (and under 80%) of scenarios")
for lbl, thr in (("50", 0.5), ("80", 0.8)):
    low = [d for d in DURS if max(sh[d].values()) < thr]
    out.append(f"  no technology above {lbl}%: {low if low else 'none'} h")

out.append("")
out.append("D. One-at-a-time LCOS ($/MWh) at the low and high end of each input range (others at base)")
for nm, d in (("li-ion (LFP)", 4), ("pumped hydro", 8), ("compressed air (cavern)", 24), ("hydrogen (cavern)", 500)):
    out.append(f" {nm} at {d} h:")
    for k, (lo, hi) in sorted(one_at_a_time(nm, d).items(), key=lambda kv: -abs(kv[1][1] - kv[1][0])):
        out.append(f"   {k:>12}: {lo:7.0f} .. {hi:7.0f}  (swing {abs(hi - lo):.0f})")

(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
