import sys, statistics as st
sys.path.insert(0, "src")
from marine_colregs.core import *
import marine_colregs.core as C
lib = encounter_library()
print(f"{len(lib)} scripted encounters, D_SAFE {D_SAFE} m, own 4 m/s, target constant course\n")
for sigma in (0.0, 0.3, 0.6):
    print(f"== target-velocity estimate error sigma_v = {sigma} m/s (3 seeds when > 0)")
    print(f"{'planner':8}{'safe %':>8}{'compl %':>9}{'both %':>8}{'med cpa':>9}{'min cpa':>9}{'med detour m':>14}")
    for pl in ("none", "rule", "vo", "mpc"):
        rs = [run(e, pl, sigma, sd) for e in lib for sd in (range(3) if sigma else [0])]
        n = len(rs)
        print(f"{pl:8}{100*sum(r['safe'] for r in rs)/n:8.1f}{100*sum(r['compliant'] for r in rs)/n:9.1f}"
              f"{100*sum(r['safe'] and r['compliant'] for r in rs)/n:8.1f}{st.median(r['cpa'] for r in rs):9.0f}"
              f"{min(r['cpa'] for r in rs):9.0f}{st.median(r['detour'] for r in rs):14.0f}")
    print()
print("== stand-on action range sweep (sigma 0): share of ALL encounters passing >= D_SAFE")
for sr in (200.0, 300.0, 450.0, 600.0):
    C.STANDON_RANGE = sr
    print(f"STANDON_RANGE {sr:4.0f} m  " + "  ".join(f"{pl} {100*sum(run(e, pl)['safe'] for e in lib)/len(lib):5.1f}%" for pl in ("rule", "vo", "mpc")))
C.STANDON_RANGE = 300.0
print()
print("== by encounter kind (sigma 0)")
for pl in ("rule", "vo", "mpc"):
    for kind in ("headon", "cross-stbd", "cross-port", "overtaking", "overtaken"):
        rs = [run(e, pl) for e in lib if e["kind"] == kind]
        print(f"{pl:5}{kind:12} safe {sum(r['safe'] for r in rs)}/{len(rs)}  compliant {sum(r['compliant'] for r in rs)}/{len(rs)}  med detour {st.median(r['detour'] for r in rs):.0f} m")
