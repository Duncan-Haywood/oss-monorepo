"""Experiments for robofab-cell-cv. Writes results.txt and results.json. Fixed seeds."""
import json, pathlib, sys
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here.parent / "src"))
from robofab_cell_cv.mva import mva, cell_demands, balanced_bounds
from robofab_cell_cv.sim import replicate

A = dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.10)
B = dict(weight=1, print=60, load=2, unload=2, inspect=3, q=0.20)
MIX = [A, B]
SEEDS = range(20)
lines, out = [], {}
def say(s=""):
    lines.append(s); print(s)
def f(m): return f"{m[0]:6.2f}+/-{m[1]:.2f}"

say("Types as robofab-cell-mva. Real semantics (printer held from load start to unload end). Rates in good parts/h.")
say("Sim: 24 h horizon, 4 h warm-up, 20 seeds, mean +/- s.e. err = (prediction - sim)/sim. wip = P+2.\n")
say("1. Variability sweep: lognormal service times with coefficient of variation cv (cv=0 is deterministic).")
out["cv"] = []
for P in [4, 8, 12, 16]:
    N = P + 2
    D, m = cell_demands(MIX, P, 1)
    mv, bd = 60 * mva(D, m, N)[0], 60 * balanced_bounds(D, m, N)
    say(f"   P={P:2d} wip {N}: MVA {mv:6.2f}  bound {bd:6.2f}")
    for cv in [0.0, 0.3, 0.6, 1.0, 1.5, 2.0]:
        dist = "det" if cv == 0 else "ln"
        s, st = replicate(MIX, P, 1, N, mode="hold", dist=dist, cv=cv, seeds=SEEDS, stats=True)
        s = (60 * s[0], 60 * s[1])
        e = lambda v: 100 * (v - s[0]) / s[0]
        say(f"      cv {cv:3.1f} sim {f(s)}  err MVA {e(mv):+5.1f}%  bound {e(bd):+5.1f}%  stall {100*st[0]:4.1f}%")
        out["cv"].append(dict(P=P, wip=N, cv=cv, sim=s, mva=mv, bound=bd, stall=st))

say("\n2. Stall share (printer-time spent finished and waiting for the arm to unload) against work in process, P=8, cv 0.3.")
out["stall_wip"] = []
D, m = cell_demands(MIX, 8, 1)
for N in [2, 4, 6, 8, 10, 14, 20]:
    s, st = replicate(MIX, 8, 1, N, mode="hold", dist="ln", cv=0.3, seeds=SEEDS, stats=True)
    s = (60 * s[0], 60 * s[1])
    mv = 60 * mva(D, m, N)[0]
    say(f"   wip {N:2d} sim {f(s)}  MVA {mv:6.2f}  stall {100*st[0]:4.1f}% +/- {100*st[1]:.1f}")
    out["stall_wip"].append(dict(wip=N, sim=s, mva=mv, stall=st))

say("\n3. Capacity accounting at wip 20 (saturated), cv 0.3, hold semantics. Held-capacity = 60*P / (printer demand incl. load+unload);")
say("   times (1 - stall) is what is left once stalls are also removed. Compared with the simulated rate.")
out["capacity"] = []
for P in [4, 8, 12, 16]:
    Dh, _ = cell_demands(MIX, P, 1, hold_printer=True)
    D, _ = cell_demands(MIX, P, 1)
    s, st = replicate(MIX, P, 1, 20, mode="hold", dist="ln", cv=0.3, seeds=SEEDS, stats=True)
    s = (60 * s[0], 60 * s[1])
    plain, held = 60 * P / D[1], 60 * P / Dh[1]
    arm = 60 / D[0]
    say(f"   P={P:2d} sim {f(s)}  print-only cap {plain:6.2f}  held cap {held:6.2f}  held*(1-stall) {held*(1-st[0]):6.2f}  arm cap {arm:6.2f}")
    out["capacity"].append(dict(P=P, sim=s, print_only=plain, held=held, held_after_stall=held * (1 - st[0]), arm=arm, stall=st))

(here / "results.txt").write_text("\n".join(lines) + "\n")
(here / "results.json").write_text(json.dumps(out, indent=1))
