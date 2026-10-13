import pathlib, sys
here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here.parent / "src"))
sys.path.insert(0, str(here.parents[1] / "selfrep-growth" / "src"))
from selfrep_repair.model import Params, fixed_point, summarise
from selfrep_growth.params import printer_copy

W, V, c, tot = printer_copy()
HOR, REPS, B = 20000.0, 100, 4
out = [f"inputs from selfrep-growth/selfrep-closure (assumed): W={W:.1f} h, V={V:.1f} units per copy; import budget B={B} units/h",
       f"horizon {HOR:.0f} h, start from 1 new machine, {REPS} runs per row, seed 0; lognormal build CV 0.2; breakdowns exponential with mean L",
       "DES = working fleet averaged over the last quarter of each run, median [5th-95th pct] over runs that survived; dead = share of runs with no working machine at the end (machines in repair do not count as working).",
       "formula = import-limited vitamin balance N = B L / (V (c + 1 - s)); replace-only is N = B L / V. reserve = share of V held back from builds for spares.", ""]

def row(label, p, hor=HOR, reps=REPS):
    lo, med, hi, dead = summarise(p, 1, hor, reps)
    return f"{label:42} DES {med:7.1f} [{lo:7.1f}-{hi:7.1f}] dead {dead:4.2f}  formula {fixed_point(p):7.1f}"

base = Params(W, V, B, 2000)
out.append("== A. repair cost share c, s=0.8, L=2000 h, reserve=1.0 V, repair 5 h (formula break-even at c = s = 0.8)")
out.append(row("replace only", base))
for cc in (0.1, 0.3, 0.5, 0.7, 0.8, 0.9, 1.0):
    out.append(row(f"repair c={cc}", Params(W, V, B, 2000, repair_cost=cc, repair_h=5, repair_ok=0.8, reserve=1.0)))
out += ["", "== B. reserve share (c=0.2, s=0.9, repair 5 h) at L=2000 h and L=300 h"]
for L in (2000, 300):
    out.append(row(f"L={L} replace only", Params(W, V, B, L)))
    for r in (0.0, 0.1, 0.2, 0.4, 1.0):
        out.append(row(f"L={L} reserve={r}", Params(W, V, B, L, repair_cost=0.2, repair_h=5, repair_ok=0.9, reserve=r)))
out += ["", "== C. repair success s (c=0.3, L=2000 h, reserve=1.0, repair 5 h); repair beats replacement when c < s"]
for s in (0.2, 0.3, 0.5, 0.8, 1.0):
    out.append(row(f"s={s}", Params(W, V, B, 2000, repair_cost=0.3, repair_h=5, repair_ok=s, reserve=1.0)))
out += ["", "== D. repair downtime (c=0.2, s=0.9, L=2000 h, reserve=1.0)"]
for d in (0, 5, 50, 200, 1000):
    out.append(row(f"downtime {d} h", Params(W, V, B, 2000, repair_cost=0.2, repair_h=d, repair_ok=0.9, reserve=1.0)))
out += ["", "== E. extinction risk at short life (c=0.2, s=0.9, repair 5 h, reserve=0.4)"]
for L in (100, 150, 200, 300, 500):
    out.append(row(f"L={L} replace only", Params(W, V, B, L)))
    out.append(row(f"L={L} repair", Params(W, V, B, L, repair_cost=0.2, repair_h=5, repair_ok=0.9, reserve=0.4)))
txt = "\n".join(out)
(here / "results.txt").write_text(txt + "\n")
print(txt)
