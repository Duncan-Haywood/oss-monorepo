"""Sweep dataflows x lanes x batch over accel-kws's 40 models. Writes results.json and results.txt."""
import json, os, sys
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_dataflow import cost as C, flows as F

M = C.load_models()
rows = []
for k, m in enumerate(M):
    for B in (1, 4):
        for P in C.LANES:
            for df in F.DATAFLOWS:
                for ps in (1.0, 0.25):
                    t = C.totals(m, df, P, B, ps)
                    rows.append(dict(model=k, seg=m["segments"], hidden=m["hidden"], wbits=m["wbits"], B=B, P=P, df=df, psum_scale=ps, **t))
json.dump(rows, open(os.path.join(HERE, "results.json"), "w"))
out = []
w = out.append

# fidelity check at P=1, B=1 against accel-kws
mx_c = mx_e = 0
for k, m in enumerate(M):
    t = [r for r in rows if r["model"] == k and r["B"] == 1 and r["P"] == 1 and r["df"] == "OS" and r["psum_scale"] == 1.0][0]
    mx_c = max(mx_c, abs(t["cycles"] + 3 - m["cycles"][0]))
    ref = m["energy_nj"]
    extra = (m["hidden"] + C.OUT) * C.E_SRAM_PJ_PER_BIT * C.ACCW / 1000     # one psum write per output
    mx_e = max(mx_e, abs(t["energy_nj"] - ref - extra))
w(f"P=1 check vs accel-kws (40 models): max |cycles+3 - RTL cycles| = {mx_c}; max |energy - (accel-kws + psum writes)| = {mx_e:.2e} nJ")


def best(sel, key):
    return min(sel, key=key)

w("\nBest dataflow by energy per inference (psum SRAM at full cost), count of 40 models, by lanes P:")
for B in (1, 4):
    for P in C.LANES:
        cnt = Counter()
        for k in range(len(M)):
            sel = [r for r in rows if r["model"] == k and r["B"] == B and r["P"] == P and r["psum_scale"] == 1.0]
            e = {r["df"]: r["energy_nj"] for r in sel}
            lo = min(e.values())
            for d, v in e.items():
                if v <= lo * (1 + 1e-9):
                    cnt[d] += 1
        w(f"  B={B} P={P:>2}: " + ", ".join(f"{d}={cnt[d]}" for d in F.DATAFLOWS))

w("\nEnergy per inference, model 7 segments / 64 hidden / 4-bit (nJ), psum SRAM 1x:")
k = [i for i, m in enumerate(M) if m["segments"] == 7 and m["hidden"] == 64 and m["wbits"] == 4][0]
for B in (1, 4):
    for P in (1, 8, 16, 32):
        sel = {r["df"]: r for r in rows if r["model"] == k and r["B"] == B and r["P"] == P and r["psum_scale"] == 1.0}
        w(f"  B={B} P={P:>2}: " + "  ".join(f"{d} {sel[d]['energy_nj']:.2f} nJ/{sel[d]['cycles']} cyc/util {sel[d]['util']:.2f}" for d in F.DATAFLOWS))

w("\nSpread (worst/best energy over dataflows), median and max over 40 models:")
for B in (1, 4):
    for P in C.LANES:
        sp = []
        for k in range(len(M)):
            e = [r["energy_nj"] for r in rows if r["model"] == k and r["B"] == B and r["P"] == P and r["psum_scale"] == 1.0]
            sp.append(max(e) / min(e))
        sp.sort()
        w(f"  B={B} P={P:>2}: median x{sp[len(sp)//2]:.2f}, max x{sp[-1]:.2f}")

w("\nCycles (lowest over dataflows) and which dataflows reach it, median model, P=16, B=1:")
for df in F.DATAFLOWS:
    cs = sorted(r["cycles"] for r in rows if r["P"] == 16 and r["B"] == 1 and r["df"] == df and r["psum_scale"] == 1.0)
    us = sorted(r["util"] for r in rows if r["P"] == 16 and r["B"] == 1 and r["df"] == df and r["psum_scale"] == 1.0)
    w(f"  {df}: median cycles {cs[len(cs)//2]}, median utilisation {us[len(us)//2]:.2f}")

w("\nSensitivity: winner counts with psum SRAM at 0.25x (B=4):")
for P in C.LANES:
    cnt = Counter()
    for k in range(len(M)):
        sel = [r for r in rows if r["model"] == k and r["B"] == 4 and r["P"] == P and r["psum_scale"] == 0.25]
        lo = min(r["energy_nj"] for r in sel)
        for r in sel:
            if r["energy_nj"] <= lo * (1 + 1e-9):
                cnt[r["df"]] += 1
    w(f"  P={P:>2}: " + ", ".join(f"{d}={cnt[d]}" for d in F.DATAFLOWS))
w("\nSensitivity: an input buffer holds the whole activation vector (every activation read once), psum SRAM 1x.")
w("Winner counts over 40 models, and median energy of each dataflow relative to the best (OS no-buffer value for reference):")
for B in (1, 4):
    for P in (1, 8, 16, 32):
        cnt = Counter(); rel = {d: [] for d in F.DATAFLOWS}
        for k, m in enumerate(M):
            e = {d: C.totals(m, d, P, B, 1.0, True)["energy_nj"] for d in F.DATAFLOWS}
            lo = min(e.values())
            for d, v in e.items():
                rel[d].append(v / lo)
                if v <= lo * (1 + 1e-9):
                    cnt[d] += 1
        w(f"  B={B} P={P:>2}: wins " + ", ".join(f"{d}={cnt[d]}" for d in F.DATAFLOWS) + " | median x best: " + ", ".join(f"{d} {sorted(rel[d])[20]:.2f}" for d in F.DATAFLOWS))
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
