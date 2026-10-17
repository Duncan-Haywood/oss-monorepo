import math, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_growth.model import Params, crossover_units, doubling_time_free, effective_doubling, time_to_reach_ode
from selfrep_growth.params import ASSEMBLY_H, PRINT_G_PER_H, printer_copy

W, V, c, tot = printer_copy()
N0, TARGET, REPS = 1, 64, 300
d = math.log2(TARGET / N0)
out = [f"assumed inputs: print {PRINT_G_PER_H} g/h, assembly {ASSEMBLY_H} h; from selfrep-closure (printer alone, LM8UU): "
       f"work/copy W={W:.1f} h, vitamins/copy V={V:.1f} (assumed units), cost closure {100*c:.1f}% of {tot:.1f}",
       f"fleet grows {N0} -> {TARGET} units ({d:.0f} doublings); {REPS} stochastic runs per row, seed 0; lognormal build time CV 0.2",
       "effective doubling time = time(1 -> 64) / 6, hours. DES = discrete-event median [5th-95th pct]; fluid = closed-form ODE.", ""]

def row(label, p):
    lo, med, hi = effective_doubling(p, N0, TARGET, REPS)
    fl = time_to_reach_ode(p, N0, TARGET) / d
    return f"{label:22} N*={crossover_units(p):7.1f}  DES {med:8.1f} [{lo:8.1f}-{hi:8.1f}]  fluid {fl:8.1f}  free {doubling_time_free(p):6.1f}"

out.append("== A. import budget sweep (fail=0)")
for b in (0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 1e9):
    out.append(row(f"budget {b:g}/h", Params(W, V, b)))
out += ["", "== B. build failure probability (budget 4/h and 64/h; a failed build loses its hours and vitamins)"]
for b in (4, 64):
    for f in (0.0, 0.1, 0.3, 0.5):
        out.append(row(f"budget {b}/h fail {f}", Params(W, V, b, fail=f)))
out += ["", "== C. what a higher vitamin-free share buys (budget 4/h; V = (1-closure) x total cost, W held fixed)"]
for cl in (0.11, 0.25, 0.5, 0.75, 0.9):
    out.append(row(f"cost closure {100*cl:.0f}%", Params(W, (1 - cl) * tot, 4)))
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
