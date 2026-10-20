"""Sweep bounded activation-buffer size K x dataflow x lanes over accel-kws's 40 models. Writes results.json, results.txt."""
import json, os, sys
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_dataflowbuf import buf
F, C = buf.F, buf.C

M = C.load_models()
KS = (0, 4, 8, 16, 32, 64, 128, 256, 512)
PS = (8, 16, 32)
RB = (0.1, 0.5)
rows = []
for k, m in enumerate(M):
    for B in (1, 4):
        for P in PS:
            for rb in RB:
                for K in KS:
                    for df in F.DATAFLOWS:
                        rows.append(dict(model=k, B=B, P=P, rb=rb, K=K, df=df, energy_nj=buf.energy_nj(m, df, P, B, K, rb)))
json.dump(rows, open(os.path.join(HERE, "results.json"), "w"))
idx = {}
for r in rows:
    idx[(r["model"], r["B"], r["P"], r["rb"], r["K"], r["df"])] = r["energy_nj"]
out = []
w = out.append
w("Bounded LRU activation buffer of K 8-bit words (K=0: accel-dataflow's one-cycle register only). Buffer read = rb x SRAM energy/bit (ASSUMED).")
w("Layer shapes: (hidden x inputs) and (11 x hidden); a full-vector buffer needs B x inputs words (B x 70 here for the first layer).")
for rb in RB:
    for B in (1, 4):
        for P in PS:
            w(f"\nrb={rb} B={B} P={P}: winners over 40 models (ties count for each) | median energy x best-over-dataflows-at-K=512")
            for K in KS:
                cnt = Counter(); rel = {d: [] for d in F.DATAFLOWS}
                for k in range(len(M)):
                    e = {d: idx[(k, B, P, rb, K, d)] for d in F.DATAFLOWS}
                    lo = min(e.values())
                    ref = min(idx[(k, B, P, rb, 512, d)] for d in F.DATAFLOWS)
                    for d, v in e.items():
                        rel[d].append(v / ref)
                        if v <= lo * (1 + 1e-9):
                            cnt[d] += 1
                w(f"  K={K:>3}: " + ", ".join(f"{d}={cnt[d]}" for d in F.DATAFLOWS) + " | " + ", ".join(f"{d} {sorted(rel[d])[20]:.2f}" for d in F.DATAFLOWS))

w("\nSmallest K at which each dataflow is within 5% of its own K=512 energy, median over 40 models:")
for rb in RB:
    for B in (1, 4):
        for P in PS:
            res = {}
            for d in F.DATAFLOWS:
                ks = []
                for k in range(len(M)):
                    full = idx[(k, B, P, rb, 512, d)]
                    ks.append(next(K for K in KS if idx[(k, B, P, rb, K, d)] <= 1.05 * full))
                res[d] = sorted(ks)[20]
            w(f"  rb={rb} B={B} P={P:>2}: " + ", ".join(f"{d}={res[d]}" for d in F.DATAFLOWS))

w("\nSmallest K at which OS is no longer the sole winner (some other dataflow is within 1e-9 or better), models where it flips, B=4:")
for rb in RB:
    for P in PS:
        flips = []
        for k in range(len(M)):
            f = next((K for K in KS if min(idx[(k, 4, P, rb, K, d)] for d in ("WS", "IS", "RT")) <= idx[(k, 4, P, rb, K, "OS")] * (1 + 1e-9)), None)
            flips.append(f)
        c = Counter(flips)
        w(f"  rb={rb} P={P:>2}: first K where OS loses or ties -> " + ", ".join(f"{('never' if f is None else f)}: {c[f]}" for f in sorted(c, key=lambda x: -1 if x is None else x)))
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
