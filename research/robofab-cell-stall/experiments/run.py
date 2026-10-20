"""Experiments for robofab-cell-stall. Writes results.txt and results.json. Fixed seeds."""
import json, pathlib, sys
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here.parent / "src"))
from robofab_cell_stall.mva import mva, cell_demands, stall_aware_rate
from robofab_cell_stall.sim import replicate

A = dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.10)
B = dict(weight=1, print=60, load=2, unload=2, inspect=3, q=0.20)
MIX = [A, B]
SEEDS = range(20)
KEYS = ["plain", "held", "stall", "stall_full"]
lines, out = [], {"grid": []}
def say(s=""):
    lines.append(s); print(s)

say("Predictors vs simulation (hold semantics, 20 seeds, 24 h, 4 h warm-up). Rates in good parts/h.")
say("plain = MVA on plain demands; held = printer demand incl. load+unload; stall = held + 0.5*(arm wait) fixed point;")
say("stall_full = same with the whole arm wait added (share 1.0, a sensitivity check). err = (prediction - sim)/sim in percent.\n")
tot = {k: [] for k in KEYS}; sat = {k: [] for k in KEYS}; unsat = {k: [] for k in KEYS}
for cv in (1.0, 0.3):
    say(f"cv {cv}")
    for P in [4, 8, 12, 16]:
        D, m = cell_demands(MIX, P, 1)
        Dh, _ = cell_demands(MIX, P, 1, hold_printer=True)
        for N in [P // 2, P, P + 2, 2 * P]:
            s = replicate(MIX, P, 1, N, mode="hold", dist="ln", cv=cv, seeds=SEEDS)
            sim = 60 * s[0]
            pred = {"plain": 60 * mva(D, m, N)[0], "held": 60 * mva(Dh, m, N)[0],
                    "stall": 60 * stall_aware_rate(MIX, P, 1, N)[0],
                    "stall_full": 60 * stall_aware_rate(MIX, P, 1, N, share=1.0)[0]}
            err = {k: 100 * (v - sim) / sim for k, v in pred.items()}
            for k in KEYS:
                tot[k].append(abs(err[k])); (sat if N == 2 * P else unsat)[k].append(abs(err[k]))
            say(f"   P={P:2d} wip {N:2d} sim {sim:6.2f}+/-{60*s[1]:.2f}  err " + "  ".join(f"{k} {err[k]:+6.1f}" for k in KEYS))
            out["grid"].append(dict(cv=cv, P=P, wip=N, sim=[sim, 60 * s[1]], pred=pred, err_pct=err))
    say()
mean = lambda v: sum(v) / len(v)
say("Mean absolute error over all rows (percent): " + ", ".join(f"{k} {mean(v):.1f}" for k, v in tot.items()) + f"  ({len(tot['plain'])} rows)")
for name, d in [("saturated rows (wip = 2P)", sat), ("other rows (wip < 2P)", unsat)]:
    say(f"Mean absolute error, {name}: " + ", ".join(f"{k} {mean(v):.1f}" for k, v in d.items()) + f"  ({len(d['plain'])} rows)")
out["mean_abs_err_pct"] = {k: mean(v) for k, v in tot.items()}
out["mean_abs_err_pct_saturated"] = {k: mean(v) for k, v in sat.items()}
out["mean_abs_err_pct_other"] = {k: mean(v) for k, v in unsat.items()}
(here / "results.txt").write_text("\n".join(lines) + "\n")
(here / "results.json").write_text(json.dumps(out, indent=1))
