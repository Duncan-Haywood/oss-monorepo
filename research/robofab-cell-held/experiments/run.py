"""Experiments for robofab-cell-held. Writes results.txt and results.json. Fixed seeds."""
import json, pathlib, sys
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here.parent / "src"))
from robofab_cell_held.mva import mva, cell_demands, balanced_bounds
from robofab_cell_held.sim import replicate

A = dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.10)
B = dict(weight=1, print=60, load=2, unload=2, inspect=3, q=0.20)
MIX = [A, B]
SEEDS = range(20)
lines, out = [], {"grid": []}
def say(s=""):
    lines.append(s); print(s)

say("Predictors vs simulation (hold semantics, 20 seeds, 24 h, 4 h warm-up). Rates in good parts/h.")
say("plain = MVA on plain demands; held = MVA with printer demand incl. load+unload; bound-h = min(N/sum D_held, capacities of held demands).")
say("err = (prediction - sim)/sim in percent. Each row is one (cv, P, wip).\n")
tot = {"plain": [], "held": [], "bound": [], "bound_h": []}
sat = {k: [] for k in tot}   # rows with wip = 2P (saturated)
unsat = {k: [] for k in tot}
for cv, dist in [(1.0, "ln"), (0.3, "ln")]:
    say(f"cv {cv}")
    for P in [4, 8, 12, 16]:
        D, m = cell_demands(MIX, P, 1)
        Dh, _ = cell_demands(MIX, P, 1, hold_printer=True)
        for N in [P // 2, P, P + 2, 2 * P]:
            s = replicate(MIX, P, 1, N, mode="hold", dist=dist, cv=cv, seeds=SEEDS)
            sim = 60 * s[0]
            pred = {"plain": 60 * mva(D, m, N)[0], "held": 60 * mva(Dh, m, N)[0],
                    "bound": 60 * balanced_bounds(D, m, N), "bound_h": 60 * balanced_bounds(Dh, m, N)}
            err = {k: 100 * (v - sim) / sim for k, v in pred.items()}
            for k in tot:
                tot[k].append(abs(err[k])); (sat if N == 2 * P else unsat)[k].append(abs(err[k]))
            say(f"   P={P:2d} wip {N:2d} sim {sim:6.2f}+/-{60*s[1]:.2f}  err plain {err['plain']:+6.1f}  held {err['held']:+6.1f}  bound {err['bound']:+6.1f}  bound-h {err['bound_h']:+6.1f}")
            out["grid"].append(dict(cv=cv, P=P, wip=N, sim=[sim, 60 * s[1]], pred=pred, err_pct=err))
    say()
say("Mean absolute error over all rows (percent): " + ", ".join(f"{k} {sum(v)/len(v):.1f}" for k, v in tot.items()) + f"  ({len(tot['plain'])} rows)")
for name, d in [("saturated rows (wip = 2P)", sat), ("other rows (wip < 2P)", unsat)]:
    say(f"Mean absolute error, {name}: " + ", ".join(f"{k} {sum(v)/len(v):.1f}" for k, v in d.items()) + f"  ({len(d['plain'])} rows)")
out["mean_abs_err_pct"] = {k: sum(v) / len(v) for k, v in tot.items()}
out["mean_abs_err_pct_saturated"] = {k: sum(v) / len(v) for k, v in sat.items()}
out["mean_abs_err_pct_other"] = {k: sum(v) / len(v) for k, v in unsat.items()}
(here / "results.txt").write_text("\n".join(lines) + "\n")
(here / "results.json").write_text(json.dumps(out, indent=1))
