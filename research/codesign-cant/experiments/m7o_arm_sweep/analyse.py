"""Milestone 7o: the numbers behind the verdicts O2-O7 (LOG.md), from results.json. Writes analysis.txt."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
R, GRID = D["runs"], D["grid"]
LABS = ["7e", "7l t45 cap wide", "aware cap wide", "aware cap wide fixL"]
K = "dead_{}_45_2"
out = []


def ok(r, j):
    return r["rho"][j] < 1.0 and r["feasible"][j]


def rs(lab, g):
    return [r for r in R if r["label"] == lab and r["geom"] == g]


def gi(L):
    return GRID.index(L)


# O2: 7l, resize, L2-45 at 0.115 vs 0.100 over seeds ok at both
for g in ("above", "below"):
    v = [(r[K.format("resize")][gi(0.100)], r[K.format("resize")][gi(0.115)]) for r in rs("7l t45 cap wide", g) if ok(r, gi(0.100)) and ok(r, gi(0.115))]
    out.append(f"O2 {g}: 7l seeds ok at 0.100 and 0.115: {len(v)}; L2-45 {sum(a for a, _ in v)} -> {sum(b for _, b in v)} (per seed {v})")

# O3: per design, interior minimum of L2-45 over its ok grid points (a later point higher than an earlier minimum by >= 3 flights)
for mode in ("resize", "pinexp"):
    n_up, n_tot, ex = 0, 0, []
    for r in R:
        idx = [j for j in range(len(GRID)) if ok(r, j)]
        if len(idx) < 3: continue
        y = [r[K.format(mode)][j] for j in idx]
        n_tot += 1
        m = int(np.argmin(y))
        if max(y[m:]) - y[m] >= 3:
            n_up += 1; ex.append(f"{r['label']} {r['geom']} s{r['seed']}: {y}")
    out.append(f"O3 {mode}: designs whose ok-grid L2-45 curve rises >= 3 flights after its minimum: {n_up} of {n_tot}")
    out += ["   " + e for e in ex]
# set-level, over the all-ok window
for g in ("above", "below"):
    for lab in LABS:
        win = [L for L in GRID if all(ok(r, gi(L)) for r in rs(lab, g))]
        y = [sum(r[K.format("resize")][gi(L)] for r in rs(lab, g)) for L in win]
        mono = all(b <= a for a, b in zip(y, y[1:]))
        out.append(f"   set {g} {lab}: all-ok window {win[0] if win else '-'}-{win[-1] if win else '-'} m, resize L2-45 {y}, non-increasing: {mono}")

# O4: pinexp vs resize, 7l, summed over ok grid points above own L
for g in ("above", "below"):
    a = b = 0
    for r in rs("7l t45 cap wide", g):
        for j, L in enumerate(GRID):
            if L > r["L0"] and ok(r, j):
                a += r[K.format("resize")][j]; b += r[K.format("pinexp")][j]
    out.append(f"O4 {g}: 7l, grid points above own L, ok: resize {a}, pinexp {b}")
# share of the gain from own L to 0.135 m taken back by exposure, per set
for g in ("above", "below"):
    for lab in LABS:
        win = [L for L in GRID if all(ok(r, gi(L)) for r in rs(lab, g))]
        if len(win) < 2: continue
        L1 = win[-1]
        own = sum(r[K.format("resize")][-1] for r in rs(lab, g))
        res = sum(r[K.format("resize")][gi(L1)] for r in rs(lab, g)); pin = sum(r[K.format("pinexp")][gi(L1)] for r in rs(lab, g))
        out.append(f"   {g} {lab}: own L {own}; at {L1} m resize {res}, pinexp {pin}")

# O5: margin/feasibility at 0.085; margin at grid points >= own L
n085 = sum(1 for r in R if not ok(r, gi(0.085)))
fail_rho_085 = sum(1 for r in R if r["rho"][gi(0.085)] >= 1.0); fail_feas_085 = sum(1 for r in R if not r["feasible"][gi(0.085)])
out.append(f"O5: at 0.085 m {n085} of {len(R)} designs fail (margin {fail_rho_085}, feasibility {fail_feas_085})")
bad = [(r["label"], r["geom"], r["seed"], L, round(r["rho"][j], 5)) for r in R for j, L in enumerate(GRID) if L >= r["L0"] and r["rho"][j] >= 1.0]
out.append(f"   grid points at or above own L that fail the margin test: {len(bad)}" + ("".join(f"\n     {b}" for b in bad)))
inf = [(r["label"], r["geom"], r["seed"], L) for r in R for j, L in enumerate(GRID) if L >= r["L0"] and not r["feasible"][j]]
out.append(f"   grid points at or above own L that are infeasible (cost cap): {len(inf)}; first L per design: " +
           ", ".join(sorted({f"{a} {b} s{c}: {min(L for a2, b2, c2, L in inf if (a2, b2, c2) == (a, b, c))}" for a, b, c, _ in inf})))

# O6: 7l at its best all-ok grid point vs aware cap wide own L
for g in ("above", "below"):
    win = [L for L in GRID if all(ok(r, gi(L)) for r in rs("7l t45 cap wide", g))]
    best = min(win, key=lambda L: sum(r[K.format("resize")][gi(L)] for r in rs("7l t45 cap wide", g)))
    v = sum(r[K.format("resize")][gi(best)] for r in rs("7l t45 cap wide", g))
    ref = sum(r[K.format("resize")][-1] for r in rs("aware cap wide", g))
    # first all-ok L at which 7l reaches the reference
    first = next((L for L in win if sum(r[K.format("resize")][gi(L)] for r in rs("7l t45 cap wide", g)) <= ref), None)
    m = np.mean([r["mass"][gi(first)] for r in rs("7l t45 cap wide", g)]) if first else None
    mref = np.mean([r["mass"][-1] for r in rs("aware cap wide", g)])
    out.append(f"O6 {g}: 7l best all-ok point {best} m: {v}; aware cap wide own L {ref}; 7l first reaches it at {first} m "
               f"(mean mass {m:.3f} kg against aware's {mref:.3f} kg)" if first else f"O6 {g}: 7l best {best}: {v}; ref {ref}; never reached")

# O7: tracking J at lever 1, 45 deg over 0.100-0.120 vs own L, 7l, seeds ok
for g in ("above", "below"):
    d = []
    for r in rs("7l t45 cap wide", g):
        for L in (0.100, 0.105, 0.110, 0.115, 0.120):
            if ok(r, gi(L)): d.append(r["J_resize_45_1"][gi(L)] - r["J_resize_45_1"][-1])
    out.append(f"O7 {g}: 7l J(45, lever 1) minus own-L J over ok points 0.100-0.120: min {min(d):+.3f}, max {max(d):+.3f}, n {len(d)}")

# mass and torque per weight along the sweep for 7l (resize), per kg of added mass
for g in ("above", "below"):
    r7 = rs("7l t45 cap wide", g)
    for L in (0.105, 0.120, 0.135):
        m = np.mean([r["mass"][gi(L)] for r in r7]); m0 = np.mean([r["mass"][-1] for r in r7])
        p = np.mean([r["power"][gi(L)] for r in r7]); p0 = np.mean([r["power"][-1] for r in r7])
        out.append(f"   7l {g} at {L}: mass {m:.3f} kg ({100 * (m / m0 - 1):+.0f}%), hover {p:.0f} W ({100 * (p / p0 - 1):+.0f}%)")

open(os.path.join(HERE, "analysis.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))

# 7l lengthened to the first all-ok L that matches 7m aware cap wide's own-L L2-45 count: hover power and lever-1 tracking J
for g, L in (("above", 0.110), ("below", 0.135)):
    a = rs("7l t45 cap wide", g); b = rs("aware cap wide", g)
    pa = np.mean([r["power"][gi(L)] for r in a]); pb = np.mean([r["power"][-1] for r in b])
    ja = np.median([r["J_resize_45_1"][gi(L)] for r in a]); jb = np.median([r["J_resize_45_1"][-1] for r in b])
    da = sum(r["dead_resize_45_1"][gi(L)] for r in a); db = sum(r["dead_resize_45_1"][-1] for r in b)
    out.append(f"match {g}: 7l at {L} m hover {pa:.0f} W, median J(45, lever 1) {ja:.3f}, lever-1 crashes {da}; "
               f"aware cap wide at own L hover {pb:.0f} W, median J {jb:.3f}, lever-1 crashes {db}")
open(os.path.join(HERE, "analysis.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out[-2:]))
