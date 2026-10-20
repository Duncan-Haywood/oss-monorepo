"""Writes experiments/results.txt. Synthetic scenes only; about a minute on one CPU core."""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_ghost import (make_canvas, render_frame, capture, object_mask, MERGES, masked_psnr)

HERE = os.path.dirname(__file__)
SIZE = 48
TRIALS = 16
A, READ, P = 4, 3.0, 300.0     # large/small area ratio, read noise (e-), e- per unit radiance in one large frame
S = P / A                      # small-sensor e- per unit radiance per frame
BORDER = 6
core = np.zeros((SIZE, SIZE), bool)
core[BORDER:-BORDER, BORDER:-BORDER] = True
out = []


def p(s=""):
    print(s)
    out.append(s)


def trial(sd, n, v):
    """Returns per-method (all, static, trail) PSNR and the large frame's, for one scene."""
    canvas = make_canvas(SIZE, seed=sd)
    rng = np.random.default_rng(5000 + sd)
    clean = [render_frame(canvas, i, v) for i in range(n)]
    truth = clean[0]
    e = np.stack([capture(c, S, READ, rng) for c in clean])
    big = capture(truth, P, READ, rng) / P           # one large-sensor frame: object frozen at its frame-0 place
    trail = object_mask(canvas, n, v) & core
    static = ~object_mask(canvas, n, v, grow=2) & core
    res = {m: (masked_psnr(f(e, S, READ), truth, core), masked_psnr(f(e, S, READ), truth, static),
               masked_psnr(f(e, S, READ), truth, trail)) for m, f in MERGES.items()}
    res["large"] = (masked_psnr(big, truth, core), masked_psnr(big, truth, static), masked_psnr(big, truth, trail))
    return res


def avg(n, v):
    acc = {}
    for sd in range(TRIALS):
        for m, t in trial(sd, n, v).items():
            acc.setdefault(m, []).append(t)
    return {m: np.mean(a, axis=0) for m, a in acc.items()}


def crossing(ns, ps, target):
    for i in range(len(ns)):
        if ps[i] >= target:
            if i == 0:
                return float(ns[0])
            f = (target - ps[i - 1]) / (ps[i] - ps[i - 1])
            return ns[i - 1] + f * (ns[i] - ns[i - 1])
    return None


names = list(MERGES)
p("# sensing-ghost: burst merging with a moving subject (synthetic scenes, Poisson-Gaussian noise)")
p(f"{SIZE}x{SIZE} px scenes, {TRIALS} scenes per cell, still camera, one bright disc (radius 4 px) moving along x at v px per frame.")
p(f"A = {A} (large/small pixel area), read = {READ:g} e-, P = {P:g} e- per unit radiance in one large frame (small frame: {S:g}).")
p("Truth = noise-free frame 0 (reference frame). PSNR is display-referred (gamma 1/2.2, scene peak 1), border cropped.")
p("all = every interior pixel; static = pixels the disc never comes within 2 px of; trail = pixels it touches in any frame (within 1 px).")
p("The large frame is one exposure of the same duration as ONE small frame, so its object is frozen at the frame-0 position.")

# A. speed sweep
N = 8
VS = [0.0, 0.25, 0.5, 1.0, 2.0, 4.0]
p(f"\n== A. PSNR (dB) against subject speed, N = {N} frames")
p("v | region | " + " | ".join(names + ["large"]))
store = {}
for v in VS:
    r = avg(N, v)
    store[v] = r
    for j, reg in enumerate(["all", "static", "trail"]):
        if v == 0.0 and reg == "trail":
            continue
        p(f"{v:g} | {reg} | " + " | ".join(f"{r[m][j]:.2f}" for m in names + ["large"]))

# B. noise-efficiency cost on a static scene: frames to tie the large frame
NS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64]
curve = {m: [] for m in names}
bigpsnr = None
for n in NS:
    r = avg(n, 0.0)
    for m in names:
        curve[m].append(r[m][0])
    bigpsnr = r["large"][0]
p(f"\n== B. PSNR (dB) against N with nothing moving (v = 0); large frame {bigpsnr:.2f} dB")
p("N | " + " | ".join(names))
for i, n in enumerate(NS):
    p(f"{n} | " + " | ".join(f"{curve[m][i]:.2f}" for m in names))
p("\nFrames to tie the large frame (linear interpolation; '>64' if never), nothing moving")
for m in names:
    c = crossing(NS, curve[m], bigpsnr)
    p(f"{m}: {'>64' if c is None else format(c, '.1f')}")

# C. N sweep with a slow subject
V = 0.25
NSC = [2, 4, 8, 16, 24, 32, 48]
p(f"\n== C. PSNR (dB) against N with a slow subject, v = {V:g} px per frame (travel {V*(max(NSC)-1):.1f} px at N = {max(NSC)})")
p("N | region | " + " | ".join(names + ["large"]))
cc = {m: [] for m in names}
cbig = []
for n in NSC:
    r = avg(n, V)
    for j, reg in enumerate(["all", "trail"]):
        jj = [0, 2][j]
        p(f"{n} | {reg} | " + " | ".join(f"{r[m][jj]:.2f}" for m in names + ["large"]))
    for m in names:
        cc[m].append(r[m][0])
    cbig.append(r["large"][0])
p("\nFrames to tie the large frame over the whole image, v = %g (large frame %.2f dB at N = %d)" % (V, cbig[-1], NSC[-1]))
for m in names:
    c = crossing(NSC, cc[m], np.mean(cbig))
    p(f"{m}: {'>48' if c is None else format(c, '.1f')}")

# D. scored against the object-free background instead (what a median-type merge is trying to give)
p("\n== D. Trail PSNR (dB) against the object-FREE background, N = 8, v = 1 (the other tables score against frame 0, object included)")
acc = {m: [] for m in names}
for sd in range(TRIALS):
    canvas = make_canvas(SIZE, seed=sd)
    rng = np.random.default_rng(5000 + sd)
    clean = [render_frame(canvas, i, 1.0) for i in range(8)]
    e = np.stack([capture(c, S, READ, rng) for c in clean])
    bg = render_frame(canvas, 0, 0.0, radius=0.0)
    tm = object_mask(canvas, 8, 1.0) & core
    for m, f in MERGES.items():
        acc[m].append(masked_psnr(f(e, S, READ), bg, tm))
p(" | ".join(names))
p(" | ".join(f"{np.mean(acc[m]):.2f}" for m in names))

open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
