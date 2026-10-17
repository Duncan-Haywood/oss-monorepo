import pathlib, sys
here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here.parent / "src"))
sys.path.insert(0, str(here.parents[1] / "selfrep-growth" / "src"))
from selfrep_wearout.model import Params, fluid_fixed_point, fluid_trajectory, interrupted_fixed_point, summarise, survives
from selfrep_growth.params import ASSEMBLY_H, PRINT_G_PER_H, printer_copy

W, V, c, tot = printer_copy()
HOR, REPS = 20000.0, 100
out = [f"inputs from selfrep-growth/selfrep-closure (assumed): W={W:.1f} h, V={V:.1f} units per copy; import budget B=4 units/h unless stated",
       f"horizon {HOR:.0f} h, start from 1 new machine, {REPS} runs per row, seed 0; lognormal build CV 0.2",
       "DES = fleet size averaged over the last quarter of each run, median [5th-95th pct] over the runs that survived; dead = share of runs with no machine left at the end.",
       "fluid = Euler integral of the ODE at the horizon; fixed pt = closed-form import-limited equilibrium (exponential life); with interrupted builds = the same equilibrium charging for builds cut short by retirement.", ""]

def row(label, p, n0=1, hor=HOR, reps=REPS):
    lo, med, hi, dead = summarise(p, n0, hor, reps)
    fl = fluid_trajectory(p, n0, hor)
    fp = fluid_fixed_point(p) if survives(p) else 0.0
    ip = interrupted_fixed_point(p) if survives(p) else 0.0
    return f"{label:30} L>W/(1-f)? {str(survives(p)):5}  DES {med:7.1f} [{lo:7.1f}-{hi:7.1f}] dead {dead:4.2f}  fluid {fl:7.1f}  fixed pt {fp:7.1f}  with interrupted builds {ip:7.1f}"

out.append("== A. mean lifetime L sweep (exponential life, no failures, no recycling)")
for L in (40, 55, 75, 100, 200, 500, 2000, 8000):
    out.append(row(f"L={L} h", Params(W, V, 4, L)))
out += ["", "== B. Weibull shape at the same mean life (L=500 h; shape 1 = constant hazard, 3 = wear-out)"]
for k in (1, 2, 3, 5):
    out.append(row(f"shape {k}", Params(W, V, 4, 500, shape=k)))
out += ["", "== C. recycling share rho of vitamin value recovered at retirement (L=500 h)"]
for r in (0.0, 0.25, 0.5, 0.75, 0.95):
    out.append(row(f"rho {r}", Params(W, V, 4, 500, recycle=r)))
out += ["", "== D. build failure probability f (L=500 h, rho=0.5)"]
for f in (0.0, 0.1, 0.3, 0.5):
    out.append(row(f"fail {f}", Params(W, V, 4, 500, fail=f, recycle=0.5)))
out += ["", "== E. import budget B (L=500 h)"]
for b in (1, 2, 4, 8, 16):
    out.append(row(f"B={b}/h", Params(W, V, b, 500)))
out += ["", "== F. seed fleet size n0 (L=200 h; every n0=1 run died out in A)"]
for n0 in (1, 2, 4, 8):
    out.append(row(f"n0={n0}", Params(W, V, 4, 200), n0=n0))
out += ["", "== G. longer horizon for the high-recycling gap in C (rho 0.95, L=500 h; 100000 h, 30 runs)"]
out.append(row("rho 0.95, 100000 h", Params(W, V, 4, 500, recycle=0.95), hor=100000.0, reps=30))
text = "\n".join(out)
print(text)
(here / "results.txt").write_text(text + "\n")
