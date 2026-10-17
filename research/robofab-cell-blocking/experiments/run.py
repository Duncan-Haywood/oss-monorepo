"""Experiments for robofab-cell-blocking. Writes results.txt and results.json. Fixed seeds."""
import json, pathlib, sys
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here.parent / "src"))
from robofab_cell_blocking.mva import mva, cell_demands, blocking_mva, split_blocking_mva
from robofab_cell_blocking.sim import replicate

A = dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.10)
B = dict(weight=1, print=60, load=2, unload=2, inspect=3, q=0.20)
MIX = [A, B]
SEEDS = range(20)
KEYS = ["plain", "held", "block_prio", "block_mva", "split"]
lines = []
def say(s=""):
    lines.append(s); print(s)

say("Predictors vs simulation (hold semantics, 20 seeds, 24 h, 4 h warm-up). Rates in good parts/h.")
say("plain = MVA on plain demands; held = MVA with printer demand incl. load+unload; block_prio = held + fitted")
say("stall from an unload-priority M/G/1 arm; block_mva = held + stall from the MVA's own arm delay; split = plain-demand MVA plus that stall, capped at the held capacity. err = (pred - sim)/sim in percent.\n")
tot = {k: [] for k in KEYS}; sat = {k: [] for k in KEYS}; unsat = {k: [] for k in KEYS}
grid = []
for cv in (1.0, 0.3):
    say(f"cv {cv}")
    for P in (4, 8, 12, 16):
        D, m = cell_demands(MIX, P, 1)
        Dh, _ = cell_demands(MIX, P, 1, hold_printer=True)
        for N in (P // 2, P, P + 2, 2 * P):
            s = replicate(MIX, P, 1, N, mode="hold", dist="ln", cv=cv, seeds=SEEDS)
            sim = 60 * s[0]
            pred = {"plain": 60 * mva(D, m, N)[0], "held": 60 * mva(Dh, m, N)[0],
                    "block_prio": 60 * blocking_mva(MIX, P, 1, N, "priority", cv)[0],
                    "block_mva": 60 * blocking_mva(MIX, P, 1, N, "mva", cv)[0],
                    "split": 60 * split_blocking_mva(MIX, P, 1, N, cv)[0]}
            err = {k: 100 * (v - sim) / sim for k, v in pred.items()}
            for k in KEYS:
                tot[k].append(abs(err[k])); (sat if N == 2 * P else unsat)[k].append(abs(err[k]))
            say(f"   P={P:2d} wip {N:2d} sim {sim:6.2f}+/-{60*s[1]:.2f}  err " + "  ".join(f"{k} {err[k]:+6.1f}" for k in KEYS))
            grid.append(dict(cv=cv, P=P, wip=N, sim=[sim, 60 * s[1]], pred=pred, err_pct=err))
    say()
mean = lambda v: sum(v) / len(v)
out = {"grid": grid}
for name, key, d in [("all rows", "mean_abs_err_pct", tot), ("saturated rows (wip = 2P)", "mean_abs_err_pct_saturated", sat),
                     ("other rows (wip < 2P)", "mean_abs_err_pct_other", unsat)]:
    say(f"Mean absolute error, {name}: " + ", ".join(f"{k} {mean(v):.1f}" for k, v in d.items()) + f"  ({len(d['plain'])} rows)")
    out[key] = {k: mean(v) for k, v in d.items()}

# Held-out check: a different job mix and cv, never used to build or choose any predictor.
C = dict(weight=2, print=10, load=1.5, unload=3, inspect=2, q=0.05)
E = dict(weight=1, print=40, load=1.5, unload=3, inspect=5, q=0.30)
HMIX = [C, E]
say("\nHeld-out mix (not used to design the predictors): C weight 2: print 10, load 1.5, unload 3, inspect 2, q 0.05;")
say("E weight 1: print 40, load 1.5, unload 3, inspect 5, q 0.30; cv 0.5; 2 inspectors.")
hold = {k: [] for k in KEYS}; hgrid = []
for P in (4, 8, 12):
    D, m = cell_demands(HMIX, P, 2); Dh, _ = cell_demands(HMIX, P, 2, hold_printer=True)
    for N in (P // 2, P, P + 2, 2 * P):
        s_ = replicate(HMIX, P, 2, N, mode="hold", dist="ln", cv=0.5, seeds=SEEDS)
        sim = 60 * s_[0]
        pred = {"plain": 60 * mva(D, m, N)[0], "held": 60 * mva(Dh, m, N)[0],
                "block_prio": 60 * blocking_mva(HMIX, P, 2, N, "priority", 0.5)[0],
                "block_mva": 60 * blocking_mva(HMIX, P, 2, N, "mva", 0.5)[0],
                "split": 60 * split_blocking_mva(HMIX, P, 2, N, 0.5)[0]}
        err = {k: 100 * (v - sim) / sim for k, v in pred.items()}
        for k in KEYS: hold[k].append(abs(err[k]))
        say(f"   P={P:2d} wip {N:2d} sim {sim:6.2f}+/-{60*s_[1]:.2f}  err " + "  ".join(f"{k} {err[k]:+6.1f}" for k in KEYS))
        hgrid.append(dict(P=P, wip=N, sim=[sim, 60 * s_[1]], pred=pred, err_pct=err))
say("Mean absolute error, held-out mix: " + ", ".join(f"{k} {mean(v):.1f}" for k, v in hold.items()) + f"  ({len(hold['plain'])} rows)")
out["heldout_grid"] = hgrid; out["mean_abs_err_pct_heldout"] = {k: mean(v) for k, v in hold.items()}
(here / "results.txt").write_text("\n".join(lines) + "\n")
(here / "results.json").write_text(json.dumps(out, indent=1))
