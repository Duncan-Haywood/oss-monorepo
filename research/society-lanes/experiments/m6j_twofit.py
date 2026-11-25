"""Milestone 6j: fit collision-free speed on two parameters (time gap T and body radius) to the whole
real HERMES transit-density curve with lobby entry, scored on level and slope.

Predictions F0 to F8 are in LOG.md, written before any number this script prints was read.

6i found that with lobby entry the collision-free speed twin (T = 0.3 s, JuPedSim's radius 0.2 m) is the
only one that reaches the dense HERMES run's density (bo-360-160-160, 1.72 /m^2), but that its curve is
too flat at 0.8 /m^2 and too fast above 1.3 /m^2. In this model a walker's speed is the free headway
ahead (centre distance minus the two radii) over the time gap, so the radius moves the density at which
walkers start to slow and the time gap moves how hard they slow. This step fits both.

Part A (fit; SEED 20350000, 6 seeds, the seeds of 6i's Part A): T in TS x radius in RS, both entrances,
N in NS; 120 s runs after a 40 s warm-up, lobby entry, bias 0.5x the fitted value (6g to 6i). Per pair:
  L, the level score (6h): RMS of cell-mean transit minus the real free-choice curve at the cell's
    density, over cells inside the real 5th to 95th density percentile, both entrances, >= 4 cells;
  S, the slope score: RMS over a 0.05 /m^2 grid from the real 5th percentile to the lower of the real
    and the twin's 95th of 0.5 x (twin slope - real slope), slopes of the quadratic fits (seconds per
    0.5 /m^2 step);
  J = sqrt(L^2 + S^2).
A pair is eligible if its 1.6 m cells reach 1.72 /m^2 within N 160 (6i's operating-N rule); the chosen
pair is the eligible pair with the smallest J.

Part B (test; SEED 20352000, 16 fresh seeds): the chosen pair and 6i's pair (T 0.3, radius 0.2), N grid
plus N_op and N_op - 20% at both entrances; curve gaps against the free-choice curve and the held-out
assigned-exit curve; the density cost at each operating point against the real curve at the twin's own
densities; time to cross there; own-right share and lane order.

Real points: 6g's per-walker crossings (m6g_density_cost_real.csv, from doi:10.34735/ped.2009.12 and
doi:10.34735/ped.2009.11), read from the committed file.

Writes m6j_twofit_results.txt and m6j_twofit_runs.csv. Needs jupedsim and numpy:
PY=$(python3 platform/ci/pyenv.py jupedsim numpy), then "$PY" experiments/m6j_twofit.py (about 50 min on
4 cores; runs cached in data_cache/m6j_cache.json). M6J_SEEDS and M6J_DURATION shorten a smoke run.
"""
from __future__ import annotations

import csv
import json
import multiprocessing as mp
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import m5_robots as M5  # noqa: E402
import m6g_density_cost as G  # noqa: E402
import m6h_recalibrate as H  # noqa: E402
import m6i_lobby as I  # noqa: E402
import sftwin as S  # noqa: E402

SEED_A, SEED_B = 20350000, 20352000
FULL_A, FULL_B = 6, 16
SEEDS_A = int(os.environ.get("M6J_SEEDS", str(FULL_A)))
SEEDS_B = int(os.environ.get("M6J_SEEDS", str(FULL_B)))
DURATION = float(os.environ.get("M6J_DURATION", str(M5.DURATION)))
SMOKE = (SEEDS_A, SEEDS_B, DURATION) != (FULL_A, FULL_B, M5.DURATION)
BETA = G.FITTED["cfsm"] * 0.5           # 6g to 6i's collision-free speed bias, 0.5x the fitted value
TS = (0.1, 0.2, 0.3, 0.5, 0.8)          # time gap, s
RS = (0.15, 0.2, 0.25, 0.3)             # body radius, m
BASE = (0.3, 0.2)                       # 6i's pair
ENTRY = "lobby"
ENTRANCES = G.ENTRANCES
NS = I.NS
REAL_RUNS = I.REAL_RUNS
DENSE = REAL_RUNS[1]
STEP = 0.5                              # /m^2: slope score is the error over this density step
B = G.B


def key(*a):
    return "|".join(str(x) for x in a)


def jobs_a():
    return [(key("A", t, r, ent, n, s), t, r, ent, n, SEED_A + s)
            for t in TS for r in RS for ent in ENTRANCES for n in NS for s in range(SEEDS_A)]


def jobs_b(pairs, ops):
    """pairs: [(T, r)]; ops: {(T, r): {ent: N_op or None}}."""
    out = []
    for t, r in pairs:
        for ent in ENTRANCES:
            ns = set(NS)
            nop = ops.get((t, r), {}).get(ent)
            if nop:
                ns |= {nop, nop - H.k_of(nop)}
            for n in sorted(ns):
                out += [(key("B", t, r, ent, n, s), t, r, ent, n, SEED_B + s) for s in range(SEEDS_B)]
    return out


def _sim(job):
    k, t, r, ent, n, seed = job
    res = S.simulate(n, M5.WIDTH, M5.LENGTH, ent, BETA, seed, model="cfsm", time_gap=t, radius=r,
                     duration=DURATION, warmup=M5.WARMUP, entry=ENTRY)
    return k, {q: float(res[q]) for q in ("transit", "transit_density", "density", "speed", "transits",
                                           "failed", "share", "lane")}


def run_all(todo, cache, cpath):
    if not todo:
        return
    with mp.Pool(max(1, (os.cpu_count() or 2))) as pool:
        for i, (k, v) in enumerate(pool.imap_unordered(_sim, todo, chunksize=2)):
            cache[k] = v
            if i % 100 == 0:
                json.dump(cache, open(cpath, "w"))
                print(f"{i + 1}/{len(todo)}", flush=True)
    json.dump(cache, open(cpath, "w"))


def cells_of(cache, part, t, r):
    """{(ent, n): [run dicts]}, failed runs and runs with no crossing dropped."""
    out = {}
    pre = key(part, t, r) + "|"
    for k, v in cache.items():
        if not k.startswith(pre) or v["failed"] or not np.isfinite(v["transit"]):
            continue
        ent, n = k.split("|")[3:5]
        out.setdefault((float(ent), int(n)), []).append(v)
    return out


def counts(cache, part, t, r):
    pre = key(part, t, r) + "|"
    rs = [v for k, v in cache.items() if k.startswith(pre)]
    return (sum(1 for v in rs if v["failed"]),
            sum(1 for v in rs if not v["failed"] and not np.isfinite(v["transit"])), len(rs))


def slope(c, rho):
    return c[1] + 2 * c[2] * np.asarray(rho, float)


def slope_score(c_twin, c_real, lo, hi):
    """RMS over [lo, hi] of STEP x (twin slope - real slope), quadratic fits; nan if the range is empty."""
    if hi <= lo:
        return float("nan")
    g = np.arange(lo, hi + 1e-9, G.GRID)
    return float(np.sqrt(np.mean((STEP * (slope(c_twin, g) - slope(c_real, g))) ** 2)))


def fit_scores(cells, fr):
    """(L, cells used, S, J, twin quadratic, twin 95th density) for one pair's grid cells."""
    lev, nc = H.score(cells, fr["point"], fr["p05"], fr["p95"])
    if sum(len(v) for v in cells.values()) < 3:
        return lev, nc, float("nan"), float("nan"), None, float("nan")
    coef, rho = G.twin_fit(cells)
    t95 = float(np.percentile(rho, 95))
    sl = slope_score(coef, fr["point"], fr["p05"], min(fr["p95"], t95))
    return lev, nc, sl, float(np.hypot(lev, sl)), coef, t95


def choose(table):
    """Eligible pair with the smallest finite J; None if none."""
    ok = [(rec["J"], p) for p, rec in table.items() if rec["eligible"] and np.isfinite(rec["J"])]
    return min(ok)[1] if ok else None


def main():
    rng = np.random.default_rng(SEED_A)
    lines = ["Milestone 6j: collision-free speed fitted on time gap and radius, lobby entry (HERMES 3.6 m corridor)",
             f"Part A {SEEDS_A} seeds, Part B {SEEDS_B} fresh seeds; {DURATION:.0f} s runs, warm-up {M5.WARMUP:.0f} s;"
             f" B = {B}; bias {BETA:g}; T in {TS} s; radius in {RS} m; slope step {STEP}/m^2."
             + ("  SMOKE RUN: not results." if SMOKE else ""), ""]
    real = I.real_points()
    fits = {s: G.real_fit(runs, rng) for s, runs in real.items()}
    fr, sym = fits["free"], fits["symmetric"]
    target = {run: float(np.mean([p[2] for p in real["free"][run]])) for run, _ in REAL_RUNS}
    lines.append(f"Real free curve: {sum(len(v) for v in real['free'].values())} crossings; density 5th/95th"
                 f" {fr['p05']:.3f}/{fr['p95']:.3f}; slope at 0.83 {float(slope(fr['point'], 0.83)):.2f},"
                 f" at 1.72 {float(slope(fr['point'], 1.72)):.2f} s per /m^2")
    lines.append("Operating densities: " + "; ".join(f"{run} {target[run]:.3f}/m^2" for run, _ in REAL_RUNS))
    lines.append("")

    os.makedirs(M5.CACHE, exist_ok=True)
    cname = f"m6j_smoke_{SEEDS_A}_{SEEDS_B}_{DURATION:.0f}.json" if SMOKE else "m6j_cache.json"
    cpath = os.path.join(M5.CACHE, cname)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    run_all([j for j in jobs_a() if j[0] not in cache], cache, cpath)

    lines.append("Part A: per pair, level score L, slope score S, J = sqrt(L^2 + S^2), maximum 1.6 m cell density,"
                 " operating N at both entrances")
    table = {}
    for t in TS:
        for r in RS:
            cells = cells_of(cache, "A", t, r)
            lev, nc, sl, j, _, t95 = fit_scores(cells, fr)
            ops = {ent: I.operating_n(cells, ent, target[run]) for run, ent in REAL_RUNS}
            top = I.max_density(cells, DENSE[1])
            nf, nx, nt = counts(cache, "A", t, r)
            table[(t, r)] = dict(L=lev, cells=nc, S=sl, J=j, top=top, ops=ops, eligible=ops[DENSE[1]] is not None)
            lines.append(f"  T {t:<4g} r {r:<4g}: L {lev:.2f} s ({nc} cells), S {sl:.2f} s, J {j:.2f} s; max {top:.2f}/m^2;"
                         f" N_op 0.9 {ops[0.9]}, 1.6 {ops[1.6]}; twin 95th {t95:.2f}; failed {nf}, no crossing {nx},"
                         f" of {nt}{'' if table[(t, r)]['eligible'] else '  (not eligible)'}")
    chosen = choose(table)
    lines.append(f"  chosen pair: {chosen}" + ("" if chosen is None else
                 f" (J {table[chosen]['J']:.2f} s against 6i's pair {table[BASE]['J']:.2f} s)"))
    best_l = min(((rec["L"], p) for p, rec in table.items() if rec["eligible"] and np.isfinite(rec["L"])),
                 default=(float("nan"), None))
    lines.append(f"  level-only pick among eligible pairs (not registered, for comparison): {best_l[1]}")
    lines.append("")

    pairs = [BASE] + ([chosen] if chosen is not None and chosen != BASE else [])
    run_all([j for j in jobs_b(pairs, {p: table[p]["ops"] for p in pairs}) if j[0] not in cache], cache, cpath)
    tag = "_smoke" if SMOKE else ""
    with open(os.path.join(HERE, f"m6j_twofit_runs{tag}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["part", "time_gap_s", "radius_m", "entrance_m", "walkers", "seed", "transit_s",
                    "transit_density", "density", "speed", "share", "lane", "transits", "failed"])
        for k in sorted(cache):
            v = cache[k]
            w.writerow(k.split("|") + [f"{v[q]:.4f}" for q in
                       ("transit", "transit_density", "density", "speed", "share", "lane")]
                       + [int(v["transits"]), int(v["failed"])])

    lines.append("Part B: fresh seeds")
    summary = {}
    for p in pairs:
        cells = cells_of(cache, "B", *p)
        grid = {c: v for c, v in cells.items() if c[1] in NS}
        nf, nx, nt = counts(cache, "B", *p)
        label = f"T {p[0]:g} r {p[1]:g}" + (" (6i)" if p == BASE else " (chosen)")
        if sum(len(v) for v in grid.values()) < 3:
            lines.append(f"  {label}: too few runs with a crossing ({nf} failed, {nx} no crossing)")
            summary[p] = dict(res={}, pts={})
            continue
        coef, rho = G.twin_fit(grid)
        boots = [G.twin_fit(G.resample_cells(grid, rng))[0] for _ in range(B)]
        tlo, thi = float(np.percentile(rho, 5)), float(np.percentile(rho, 95))
        lev, nc, sl, j, _, _ = fit_scores(grid, fr)
        res = {}
        for name, ft in (("free", fr), ("assigned-exit", sym)):
            lo, hi = max(tlo, ft["p05"]), min(thi, ft["p95"])
            res[name] = (G.curve_gap(coef, ft["point"], lo, hi),
                         G.ci([G.curve_gap(boots[i], ft["boots"][i], lo, hi) for i in range(B)]), lo, hi)
        lines.append(f"  {label}: failed {nf}, no crossing {nx}, of {nt}; density 5th/95th {tlo:.2f}/{thi:.2f};"
                     f" fresh-seed L {lev:.2f} s, S {sl:.2f} s, J {j:.2f} s")
        for name, (gap, gci, lo, hi) in res.items():
            lines.append(f"    curve gap vs {name} over [{lo:.2f}, {hi:.2f}]: {gap:.2f} s [{gci[0]:.2f}, {gci[1]:.2f}]")
        pts = {}
        for run, ent in REAL_RUNS:
            nop = table[p]["ops"].get(ent)
            if not nop:
                lines.append(f"    {run}: the twin never reached {target[run]:.2f}/m^2 at entrance {ent} (Part A)")
                pts[run] = None
                continue
            nk = nop - H.k_of(nop)
            cost, ra, rb = G.cell_cost(cells, ent, nop, nk)
            pair = {c: cells[c] for c in ((ent, nop), (ent, nk)) if c in cells}
            tci = G.ci([G.cell_cost(G.resample_cells(pair, rng), ent, nop, nk)[0] for _ in range(B)])
            rc = float(G.evalq(fr["point"], ra) - G.evalq(fr["point"], rb))
            rci = G.ci([G.evalq(c, ra) - G.evalq(c, rb) for c in fr["boots"]])
            rs = cells.get((ent, nop), [])
            sh = float(np.nanmean([v["share"] for v in rs])) if rs else float("nan")
            ln = float(np.nanmean([v["lane"] for v in rs])) if rs else float("nan")
            tt = float(np.mean([v["transit"] for v in rs])) if rs else float("nan")
            pts[run] = dict(n=nop, nk=nk, twin=cost, twin_ci=tci, real=rc, real_ci=rci, share=sh, lane=ln,
                            twin_t=tt, real_t=float(G.evalq(fr["point"], ra)))
            lines.append(f"    {run} (entrance {ent}): N {nop} vs {nk}: twin cost {cost:+.2f} s [{tci[0]:+.2f},"
                         f" {tci[1]:+.2f}] (density {ra:.3f} vs {rb:.3f}); real curve at those densities {rc:+.2f} s"
                         f" [{rci[0]:+.2f}, {rci[1]:+.2f}]; transit twin {tt:.2f} s, real {pts[run]['real_t']:.2f} s;"
                         f" own-right share {sh:.3f}, lane order {ln:.3f}")
        summary[p] = dict(res=res, pts=pts)
    lines.append("")
    lines += verdicts(table, chosen, summary)
    out = os.path.join(HERE, f"m6j_twofit_results{tag}.txt")
    open(out, "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


def verdicts(table, chosen, summary):
    L_ = ["Registered predictions (LOG.md):"]

    def say(name, text, ok, detail):
        L_.append(f"{name} ({text}): {'untestable' if ok is None else ('held' if ok else 'refuted')} ({detail})")

    b = table[BASE]
    say("F0", "6i's pair reproduces 6i's lobby Part A score, 0.99 s over 15 cells",
        abs(b["L"] - 0.99) < 0.005 and b["cells"] == 15, f"{b['L']:.4f} s over {b['cells']} cells")
    c = table.get(chosen)
    none = "no eligible pair"
    say("F1", "chosen pair's J at least 30% below 6i's pair's J",
        None if c is None else c["J"] <= 0.7 * b["J"],
        none if c is None else f"{chosen}: {c['J']:.3f} against {b['J']:.3f} s, ratio {c['J'] / b['J']:.3f}")
    say("F2", "chosen radius above 0.2 m", None if c is None else chosen[1] > 0.2, f"{chosen}")
    say("F3", f"chosen time gap inside the grid (not {TS[0]} or {TS[-1]} s)",
        None if c is None else TS[0] < chosen[0] < TS[-1], f"{chosen}")
    sm = summary.get(chosen, {}) if chosen is not None else {}
    res, pts = sm.get("res", {}), sm.get("pts", {})
    for name, lab, key_ in (("F4", "free-choice", "free"), ("F5", "held-out assigned-exit", "assigned-exit")):
        g = res.get(key_)
        say(name, f"fresh seeds: chosen pair's curve gap against the {lab} curve below 0.6 s",
            None if g is None else g[0] < 0.6, "untested" if g is None else f"{g[0]:.2f} s [{g[1][0]:.2f}, {g[1][1]:.2f}]")
    for name, (run, _) in (("F6", REAL_RUNS[0]), ("F7", REAL_RUNS[1])):
        pt = pts.get(run)
        ok = None if not pt or not np.isfinite(pt["twin"]) else pt["real_ci"][0] <= pt["twin"] <= pt["real_ci"][1]
        say(name, f"{run}: chosen pair's marginal-walker cost inside the real interval", ok,
            "not reached" if not pt else f"twin {pt['twin']:+.2f}, real {pt['real']:+.2f} [{pt['real_ci'][0]:+.2f},"
            f" {pt['real_ci'][1]:+.2f}]")
    pt = pts.get(DENSE[0])
    say("F8", "dense operating point: chosen pair's time to cross within 1.0 s of the real curve",
        None if not pt else abs(pt["twin_t"] - pt["real_t"]) <= 1.0,
        "not reached" if not pt else f"twin {pt['twin_t']:.2f} s, real {pt['real_t']:.2f} s")
    return L_


if __name__ == "__main__":
    main()
