import math, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_partpool.model import ASSEMBLY_H, PRINT_G_PER_H, Params, default_params, effective_doubling, simulate

REPS, N0, TARGET = 100, 1, 64
p0 = default_params(1e9)
W = sum(p0.parts) + p0.asm_h
out = [f"assumed inputs: print {PRINT_G_PER_H} g/h, assembly {ASSEMBLY_H} h (as selfrep-growth); {len(p0.parts)} printed parts of "
       f"{p0.parts[0]:.1f} h each from selfrep-closure, work per copy {W:.1f} h, vitamins per copy {p0.vit_cost:.1f} (assumed units)",
       f"fleet {N0} -> {TARGET}; {REPS} runs per cell, seed 0; every job lognormal; effective doubling = time / 6 (hours), median [5th-95th pct]",
       f"fluid free doubling W ln2 = {W*math.log(2):.1f} h", ""]

def cell(p, pol):
    lo, med, hi = effective_doubling(p, pol, N0, TARGET, REPS)
    return f"{med:7.1f} [{lo:7.1f}-{hi:7.1f}]"

out.append("== A. import budget sweep (cv 0.2)")
out.append(f"{'budget/h':>9}  {'whole':>22}  {'focus':>22}  {'spread':>22}")
for b in (0.25, 1, 4, 16, 64, 256, 1e9):
    p = default_params(b)
    out.append(f"{b:9g}  " + "  ".join(cell(p, pol) for pol in ("whole", "focus", "spread")))

out += ["", "== B. deterministic (cv 0), budget unlimited: time to reach each fleet size, hours"]
out.append(f"{'fleet':>6}  {'whole':>8}  {'focus':>8}  {'spread':>8}")
p = default_params(1e9, cv=0)
for tgt in (2, 4, 8, 16, 32, 64):
    out.append(f"{tgt:6d}  " + "  ".join(f"{simulate(p, pol, 1, tgt):8.1f}" for pol in ("whole", "focus", "spread")))

out += ["", "== C. job noise (budget unlimited): median effective doubling by CV"]
out.append(f"{'cv':>5}  {'whole':>22}  {'focus':>22}  {'spread':>22}")
for cv in (0.0, 0.2, 0.5, 1.0):
    p = default_params(1e9, cv=cv)
    out.append(f"{cv:5.1f}  " + "  ".join(cell(p, pol) for pol in ("whole", "focus", "spread")))

out += ["", "== D. assembly time (budget unlimited, cv 0.2): assembly is a serial step per copy"]
out.append(f"{'asm h':>6}  {'whole':>22}  {'focus':>22}  {'spread':>22}")
for a in (0.5, 6.0, 24.0):
    p = Params(p0.parts, a, p0.vit_cost, 1e9)
    out.append(f"{a:6.1f}  " + "  ".join(cell(p, pol) for pol in ("whole", "focus", "spread")))
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
