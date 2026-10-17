"""Experiments for robofab-cell-mva. Writes results.txt and results.json. Fixed seeds."""
import json, pathlib, sys
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here.parent / "src"))
from robofab_cell_mva.mva import mva, cell_demands, balanced_bounds
from robofab_cell_mva.sim import replicate

A = dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.10)
B = dict(weight=1, print=60, load=2, unload=2, inspect=3, q=0.20)
MIX = [A, B]
SEEDS = range(20)
lines, out = [], {}
def say(s=""):
    lines.append(s); print(s)
def f(m): return f"{m[0]:6.2f}+/-{m[1]:.2f}"

say("Types: A print 20 min q 0.10; B print 60 min q 0.20; load/unload 2 min; inspect 3 min; equal mix.")
say("Rates in good parts per hour. Sim: 24 h horizon, 4 h warm-up, 20 seeds, mean +/- s.e.\n")

say("1. Product-form-compatible model (arm one service per pass, printer held only while printing).")
say("   MVA is exact when all services are exponential and every FCFS station has one mean for all jobs.")
say("   Single type A, exponential, wip = P+2:")
out["pf_single"] = []
for P in [1, 2, 4, 6, 8]:
    D, m = cell_demands([A], P, 1)
    x = 60 * mva(D, m, P + 2)[0]
    s = replicate([A], P, 1, P + 2, mode="pf", dist="exp", seeds=SEEDS)
    s = (60 * s[0], 60 * s[1])
    say(f"   P={P:2d} MVA {x:6.2f}  sim {f(s)}  diff/s.e. {(s[0]-x)/s[1]:+.1f}")
    out["pf_single"].append(dict(P=P, mva=x, sim=s))

say("\n2. Same, equal mix of A and B (printing station has two mean service times, so not exactly product form):")
out["pf_mix"] = []
for P in [1, 2, 4, 6, 8]:
    D, m = cell_demands(MIX, P, 1)
    x = 60 * mva(D, m, P + 2)[0]
    s = replicate(MIX, P, 1, P + 2, mode="pf", dist="exp", seeds=SEEDS)
    s = (60 * s[0], 60 * s[1])
    say(f"   P={P:2d} MVA {x:6.2f}  sim {f(s)}  MVA error {100*(x-s[0])/s[0]:+.1f}%")
    out["pf_mix"].append(dict(P=P, mva=x, sim=s))

say("\n3. Error of MVA and of the utilisation bound against sim, mix, wip = P+2. 'err' = (prediction - sim)/sim.")
say("   variants: pf/exp, pf/ln(cv .3), pf/det, hold/ln(cv .3), hold/det. 'MVA-h' uses printer demand + load + unload.")
out["variants"] = []
for P in [4, 8, 12, 16]:
    N = P + 2
    D, m = cell_demands(MIX, P, 1)
    Dh, _ = cell_demands(MIX, P, 1, hold_printer=True)
    mv, mvh, bd = 60 * mva(D, m, N)[0], 60 * mva(Dh, m, N)[0], 60 * balanced_bounds(D, m, N)
    say(f"   P={P:2d} wip {N}: MVA {mv:6.2f}  MVA-h {mvh:6.2f}  bound {bd:6.2f}")
    for name, mode, dist in [("pf/exp", "pf", "exp"), ("pf/ln", "pf", "ln"), ("pf/det", "pf", "det"),
                             ("hold/ln", "hold", "ln"), ("hold/det", "hold", "det")]:
        s = replicate(MIX, P, 1, N, mode=mode, dist=dist, seeds=SEEDS)
        s = (60 * s[0], 60 * s[1])
        e = lambda v: 100 * (v - s[0]) / s[0]
        say(f"      {name:9s} sim {f(s)}  err MVA {e(mv):+5.1f}%  MVA-h {e(mvh):+5.1f}%  bound {e(bd):+5.1f}%")
        out["variants"].append(dict(P=P, wip=N, variant=name, sim=s, mva=mv, mva_h=mvh, bound=bd))

say("\n4. Work-in-process sweep, P=8, hold/ln (the real-cell semantics).")
out["wip"] = []
D, m = cell_demands(MIX, 8, 1); Dh, _ = cell_demands(MIX, 8, 1, hold_printer=True)
for N in [2, 4, 6, 8, 10, 14, 20]:
    s = replicate(MIX, 8, 1, N, mode="hold", dist="ln", seeds=SEEDS)
    s = (60 * s[0], 60 * s[1])
    mv, mvh = 60 * mva(D, m, N)[0], 60 * mva(Dh, m, N)[0]
    say(f"   wip {N:2d} sim {f(s)}  MVA {mv:6.2f}  MVA-h {mvh:6.2f}")
    out["wip"].append(dict(wip=N, sim=s, mva=mv, mva_h=mvh))

(here / "results.txt").write_text("\n".join(lines) + "\n")
(here / "results.json").write_text(json.dumps(out, indent=1))
