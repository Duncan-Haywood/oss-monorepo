"""Exact vs block-minimum noise floor in the C adaptive gate: agreement, recall, battery, RAM, cost.
Prints the tables quoted in the README (redirect to results.txt)."""
import numpy as np
from ambient_gatefw import native
from ambient_gatefw.ref import FRAME, Params, battery_hours, frame_ms, score, synth

P = Params()
ROOMS = [-60, -50, -40, -30]
SEEDS = range(20)
SECONDS = 120
K, HANG = 4, 10
BLOCKS = [1, 2, 5, 10, 25, 50]       # AGATE_BLOCK values that divide 250

data = {r: [synth(SECONDS, r, seed=1000 * (r + 100) + s) for s in SEEDS] for r in ROOMS}   # same audio as ambient-gateroc

print(f"synthetic audio: {len(SEEDS)} seeds x {SECONDS} s per room, k = {K}, hangover {HANG} frames (20 ms each)")
print("gate = the C in firmware/adaptive_gate.c compiled for the host with gcc -O2; audio from ambient-gateroc/sim.py")
print("\n== footprint and cost per block size (host build; comparisons counted, not cycles) ==")
print("block  window(frames)  struct bytes  floor compares/frame (steady state)")
cmp_per_frame = {}
for b in BLOCKS:
    lib = native.build(b, count=True)
    x = data[-50][0][0]
    native.run(lib, x, FRAME, K, HANG)
    nf = len(x) // FRAME
    ring = 250 // b - 1
    cmp_per_frame[b] = lib.harness_compares() / nf
    print(f"{b:>5}  {ring * b + 1:>3}-{(ring + 1) * b:<3}        {lib.harness_sizeof():>5}         {ring:>3} (mean over run {cmp_per_frame[b]:.1f})")

print("\n== per room, mean over seeds: recall / open fraction / battery hours; and gate disagreement with block 1 ==")
res = {}
for b in BLOCKS:
    lib = native.build(b)
    res[b] = {}
    for r in ROOMS:
        sc, dis = [], []
        for x, act in data[r]:
            op, _ = native.run(lib, x, FRAME, K, HANG)
            ex, _ = native.run(native.build(1), x, FRAME, K, HANG)
            sc.append(score(op, act))
            dis.append((op != ex).mean())
        m = np.nanmean(np.array(sc), axis=0)
        res[b][r] = (m[0], m[1], battery_hours(P, m[1]), float(np.mean(dis)))
    print(f"block {b:>2}:  " + "  ".join(f"[{r}] {v[0]:.3f}/{v[1]:.3f}/{v[2]:5.1f}h/dis {v[3]:.4f}"
                                          for r, v in res[b].items()))

print("\n== worst-room difference from block 1 ==")
for b in BLOCKS[1:]:
    dr = max(abs(res[b][r][0] - res[1][r][0]) for r in ROOMS)
    dh = max(abs(res[b][r][2] - res[1][r][2]) for r in ROOMS)
    print(f"block {b:>2}: max |recall diff| {dr:.4f}, max |hours diff| {dh:.2f} h")

print("\n== a stepped room: -60 dBFS for 60 s, then -35 dBFS for 60 s (rises 25 dB); open fraction in the first 10 s after the step ==")
for b in BLOCKS:
    lib = native.build(b)
    fr = []
    for s in SEEDS:
        a, _ = synth(60, -60, seed=7000 + s)
        c, _ = synth(60, -35, seed=8000 + s)
        x = np.concatenate([a, c])
        op, _ = native.run(lib, x, FRAME, K, HANG)
        i0 = len(a) // FRAME
        fr.append(op[i0:i0 + 500].mean())
    print(f"block {b:>2}: open fraction {np.mean(fr):.3f} (20 seeds)")
