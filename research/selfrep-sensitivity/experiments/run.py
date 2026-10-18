import math, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_sensitivity.sobol import NAMES, build, elasticity, sobol
from selfrep_growth.model import Params, effective_doubling
from selfrep_growth.params import ASSEMBLY_H, PRINT_G_PER_H, printer_copy

W, V, c, tot = printer_copy()
PRINTED_G = (W - ASSEMBLY_H) * PRINT_G_PER_H
N = 4000
out = [f"baseline from selfrep-growth: print {PRINT_G_PER_H} g/h x {PRINTED_G:.0f} g printed, assembly {ASSEMBLY_H} h (W={W:.1f} h), vitamins V={V:.1f} units; fleet 1 -> 64",
       f"Sobol: Saltelli/Jansen estimators, N={N} base samples x {len(NAMES)+2} evaluations, seed 0, fluid model; inputs independent",
       "ranges: print rate, assembly h, vitamin cost, budget log-uniform within x/s..x*s (s given per scenario); fail uniform on 0..0.5", ""]

def scen(label, bud, spread):
    base = [PRINT_G_PER_H, ASSEMBLY_H, V, bud, 0.25]
    sp = {"print_rate": 2, "assembly_h": 2, "vit_cost": 2, "budget": spread}
    out.append(f"== {label}: budget baseline {bud}/h, budget spread x/{spread}..x{spread}, others x/2..x2")
    for logo in (False, True):
        r = sobol(base, sp, PRINTED_G, n=N, log_output=logo)
        out.append(f"  output = {'ln(doubling time)' if logo else 'doubling time (h)'}; sum S1 = {sum(v[0] for v in r.values()):.2f}")
        for k, (s1, st) in sorted(r.items(), key=lambda kv: -kv[1][1]):
            out.append(f"    {k:11} S1 {s1:6.3f}  ST {st:6.3f}")
    out.append("")

scen("A import-limited", 4, 2)
scen("B time-limited", 64, 2)
scen("C wide budget", 4, 16)

out.append("== D. local elasticity d ln T / d ln x at the baselines (fluid, central difference), and DES check")
out.append("   DES: +-20% step on one input, 300 runs each, same seeds; elasticity = dlnT/dlnx between the two medians")
for bud in (4, 64):
    base = [PRINT_G_PER_H, ASSEMBLY_H, V, bud, 0.1]
    out.append(f"  budget {bud}/h, fail 0.1")
    for i, name in enumerate(NAMES):
        fl = elasticity(base, PRINTED_G, i)
        if name in ("print_rate", "assembly_h"):
            des = ""
        else:
            lo, hi = list(base), list(base)
            lo[i], hi[i] = base[i] * 0.8, base[i] * 1.2
            ts = []
            for x in (lo, hi):
                rate, asm, vit, b, fail = x
                p = Params(PRINTED_G / rate + asm, vit, b, fail)
                ts.append(effective_doubling(p, 1, 64, 300)[1])
            des = f"{math.log(ts[1] / ts[0]) / math.log(1.2 / 0.8):6.2f}"
            if name == "fail":
                des = f"{math.log(ts[1] / ts[0]) / math.log((1 - hi[i]) / (1 - lo[i])):6.2f}"
        out.append(f"    {name:11} fluid {fl:6.2f}   DES {des if des else '   n/a'}")
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
