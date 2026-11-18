"""Milestone 6h: recalibrate each twin on the HERMES transit-density curve, then test it on held-out seeds and runs.

Predictions R1 to R7 are in LOG.md, written before any number this script prints was read.

6g found every twin mis-prices an extra walker because milestone 3 calibrated walker count on median speed:
the twins reach the real runs' speeds at about half the real density, and at a given density they are
1.5 to 3.7 s too slow per 8 m. Each family has one free parameter that sets how much room a walker keeps:
social force's interaction strength A (Helbing et al. 2000; JuPedSim default 2000 N), collision-free
speed's time gap T (Tordeux et al. 2016; JuPedSim default 1.0 s) and ORCA's time horizon tau (van den Berg
et al. 2011; RVO2's example value 5 s). This step fits that parameter to the real curve.

Part A (calibration, SEED0 20340000, 4 seeds): the four 6f settings, each parameter on a five-value grid that
brackets the default on both sides, entrances 0.9 and 1.6 m, N in NS; 120 s runs, 40 s warm-up. Score of a
value = RMS over cells (entrance, N) whose mean transit density lies inside the real free-choice walkers'
5th to 95th percentile of (cell-mean transit - T_free(cell-mean transit density)), T_free being 6g's
quadratic fitted to the five free-choice 3.6 m runs. A value needs at least MIN_CELLS cells in range. The
chosen value is the grid minimum. Operating walker counts: per HERMES run (bo-360-090-090 at 0.9 m,
bo-360-160-160 at 1.6 m), the N at which the chosen twin's cell-mean transit density first reaches the
run's own mean crossing density (6g Part A), by linear interpolation over NS, rounded.

Part B (held out, SEED0 20341000, 12 fresh seeds): at the chosen value, the N grid again plus the operating
counts N_op and N_op - k (k = 20%) at both entrances. Reports (i) the curve gap (RMS of fitted quadratics on
a 0.05 /m^2 grid) against the free curve, on fresh seeds; (ii) the curve gap against the eight
assigned-exit 3.6 m runs' curve (doi:10.34735/ped.2009.11, which played no part in the fit) over the range
both cover; (iii) the density cost at the operating points, twin against the real free curve at the
densities the twin produced; (iv) people's own-right share and lane order at the operating points.

Writes m6h_recalibrate_results.txt and m6h_recalibrate_runs.csv. Needs jupedsim, numpy, numba:
PY=$(python3 platform/ci/pyenv.py jupedsim numpy numba), then "$PY" experiments/m6h_recalibrate.py
(runs cached in data_cache/m6h_cache.json). M6H_SEEDS and M6H_DURATION shorten a smoke run.
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
import sftwin as S  # noqa: E402

SEED_A, SEED_B = 20340000, 20341000
FULL_A, FULL_B = 4, 12
SEEDS_A = int(os.environ.get("M6H_SEEDS", str(FULL_A)))
SEEDS_B = int(os.environ.get("M6H_SEEDS", str(FULL_B)))
DURATION = float(os.environ.get("M6H_DURATION", str(M5.DURATION)))
SMOKE = (SEEDS_A, SEEDS_B, DURATION) != (FULL_A, FULL_B, M5.DURATION)
SETTINGS = G.SETTINGS                     # (family, bias multiplier), 6f's four
PARAM = {"sf": "agent_scale", "cfsm": "time_gap", "orca": "tau"}
DEFAULT = {"sf": 2000.0, "cfsm": 1.0, "orca": 5.0}
GRIDS = {"sf": (4000.0, 2000.0, 1000.0, 500.0, 250.0),
         "cfsm": (1.5, 1.0, 0.7, 0.5, 0.3),
         "orca": (10.0, 5.0, 3.0, 2.0, 1.0)}
ENTRANCES = G.ENTRANCES
NS = (20, 30, 40, 50, 60, 75, 90, 105, 120)
MIN_CELLS = 4
# the two HERMES runs milestone 5 uses, with their mean crossing density from 6g Part A (results file)
REAL_RUNS = (("bo-360-090-090", 0.9), ("bo-360-160-160", 1.6))
SHARE = G.SHARE
B = G.B
NAMES = G.NAMES


def key(*a):
    return "|".join(str(x) for x in a)


def k_of(n):
    return M5.n_robots(n, SHARE)


def jobs_a():
    out = []
    for fam, m in SETTINGS:
        for v in GRIDS[fam]:
            for ent in ENTRANCES:
                for n in NS:
                    for s in range(SEEDS_A):
                        out.append((key("A", fam, m, v, ent, n, s), fam, ent, n, G.FITTED[fam] * m, v, SEED_A + s))
    return out


def jobs_b(chosen, ops):
    """chosen: {(fam, m): value}; ops: {(fam, m): {ent: N_op}}."""
    out = []
    for fam, m in SETTINGS:
        v = chosen.get((fam, m))
        if v is None:
            continue
        ns = {ent: set(NS) for ent in ENTRANCES}
        for ent, nop in ops.get((fam, m), {}).items():
            if nop:
                ns[ent] |= {nop, nop - k_of(nop)}
        for ent in ENTRANCES:
            for n in sorted(ns[ent]):
                for s in range(SEEDS_B):
                    out.append((key("B", fam, m, v, ent, n, s), fam, ent, n, G.FITTED[fam] * m, v, SEED_B + s))
    return out


def _sim(job):
    k, fam, ent, n, beta, v, seed = job
    kw = dict(duration=DURATION, warmup=M5.WARMUP)
    if fam == "orca":
        import orca as mod
        r = mod.simulate(n, M5.WIDTH, M5.LENGTH, ent, beta, seed, tau=v, **kw)
    else:
        r = S.simulate(n, M5.WIDTH, M5.LENGTH, ent, beta, seed, model=fam, **{PARAM[fam]: v}, **kw)
    return k, {q: float(r[q]) for q in ("transit", "transit_density", "density", "speed", "transits",
                                         "failed", "share", "lane")}


def run_all(todo, cache, cpath):
    if not todo:
        return
    with mp.Pool(max(1, (os.cpu_count() or 2))) as pool:
        for i, (k, r) in enumerate(pool.imap_unordered(_sim, todo, chunksize=2)):
            cache[k] = r
            if i % 100 == 0:
                json.dump(cache, open(cpath, "w"))
                print(f"{i + 1}/{len(todo)}", flush=True)
    json.dump(cache, open(cpath, "w"))


def cells_of(cache, part, fam, m, v):
    """{(ent, n): [run dicts]} for one part/setting/value, failed runs dropped."""
    out = {}
    pre = key(part, fam, m, v) + "|"
    for k, r in cache.items():
        if not k.startswith(pre):
            continue
        if r["failed"] or not np.isfinite(r["transit"]):
            continue
        _, _, _, _, ent, n, _ = k.split("|")
        out.setdefault((float(ent), int(n)), []).append(r)
    return out


def n_failed(cache, part, fam, m, v):
    pre = key(part, fam, m, v) + "|"
    return sum(1 for k, r in cache.items() if k.startswith(pre) and r["failed"]), \
        sum(1 for k in cache if k.startswith(pre))


def cell_means(cells):
    """[(ent, n, mean transit density, mean transit)]."""
    return [(ent, n, float(np.mean([r["transit_density"] for r in rs])), float(np.mean([r["transit"] for r in rs])))
            for (ent, n), rs in sorted(cells.items()) if rs]


def score(cells, c_real, lo, hi):
    """(RMS cell residual against the real curve over cells inside [lo, hi], cells used)."""
    res = [t - float(G.evalq(c_real, rho)) for _, _, rho, t in cell_means(cells) if lo <= rho <= hi]
    if len(res) < MIN_CELLS:
        return float("nan"), len(res)
    return float(np.sqrt(np.mean(np.square(res)))), len(res)


def operating_n(cells, ent, target):
    """N at which cell-mean transit density first reaches target, interpolated over NS; None if never."""
    pts = [(n, rho) for e, n, rho, _ in cell_means(cells) if e == ent and n in NS]
    pts.sort()
    for (n0, r0), (n1, r1) in zip(pts, pts[1:]):
        if r0 <= target <= r1 and r1 > r0:
            return int(round(n0 + (target - r0) / (r1 - r0) * (n1 - n0)))
    if pts and pts[0][1] >= target:
        return pts[0][0]
    return None


def pick(scores):
    """Grid value with the smallest finite score; None if none is finite."""
    ok = [(s, v) for v, (s, _) in scores.items() if np.isfinite(s)]
    return min(ok)[1] if ok else None


def main():
    rng = np.random.default_rng(SEED_A)
    lines = ["Milestone 6h: each twin's spacing parameter recalibrated on the HERMES transit-density curve (3.6 m)",
             f"Part A {SEEDS_A} seeds, Part B {SEEDS_B} fresh seeds; {DURATION:.0f} s runs, warm-up {M5.WARMUP:.0f} s;"
             f" B = {B}." + ("  SMOKE RUN: not results." if SMOKE else ""), ""]
    real = G.real_points()
    fits = {s: G.real_fit(runs, rng) for s, runs in real.items()}
    fr, sym = fits["free"], fits["symmetric"]
    target = {run: float(np.mean([p[2] for p in real["free"][run]])) for run, _ in REAL_RUNS}
    lines.append(f"Real free curve: {sum(len(v) for v in real['free'].values())} crossings; density 5th/95th"
                 f" {fr['p05']:.3f}/{fr['p95']:.3f}; assigned-exit curve {sum(len(v) for v in real['symmetric'].values())}"
                 f" crossings, 5th/95th {sym['p05']:.3f}/{sym['p95']:.3f}")
    lines.append("Operating densities (mean crossing density of the run): "
                 + "; ".join(f"{run} {target[run]:.3f}/m^2" for run, _ in REAL_RUNS))
    lines.append("")

    os.makedirs(M5.CACHE, exist_ok=True)
    cname = f"m6h_smoke_{SEEDS_A}_{SEEDS_B}_{DURATION:.0f}.json" if SMOKE else "m6h_cache.json"
    cpath = os.path.join(M5.CACHE, cname)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    run_all([j for j in jobs_a() if j[0] not in cache], cache, cpath)

    # Part A: score the grid, pick, find operating counts
    lines.append("Part A: calibration score = RMS of (cell-mean transit - real free curve at the cell's density),"
                 f" cells inside [{fr['p05']:.2f}, {fr['p95']:.2f}] /m^2")
    chosen, ops, sc_all = {}, {}, {}
    for fam, m in SETTINGS:
        scores = {}
        for v in GRIDS[fam]:
            cells = cells_of(cache, "A", fam, m, v)
            scores[v] = score(cells, fr["point"], fr["p05"], fr["p95"])
            nf, nt = n_failed(cache, "A", fam, m, v)
            cm = cell_means(cells)
            top = max((rho for _, _, rho, _ in cm), default=float("nan"))
            lines.append(f"  {NAMES[fam]} x{m} {PARAM[fam]}={v:g}{' (default)' if v == DEFAULT[fam] else ''}:"
                         f" score {scores[v][0]:.2f} s over {scores[v][1]} cells; max cell density {top:.2f};"
                         f" failed {nf}/{nt}")
        sc_all[(fam, m)] = scores
        v = pick(scores)
        chosen[(fam, m)] = v
        if v is None:
            lines.append(f"    no value scored; setting dropped from Part B")
            continue
        cells = cells_of(cache, "A", fam, m, v)
        ops[(fam, m)] = {ent: operating_n(cells, ent, target[run]) for run, ent in REAL_RUNS}
        lines.append(f"    chosen {PARAM[fam]} = {v:g}; operating N: "
                     + "; ".join(f"entrance {ent} -> {ops[(fam, m)][ent]}" for _, ent in REAL_RUNS))
    lines.append("")

    run_all([j for j in jobs_b(chosen, ops) if j[0] not in cache], cache, cpath)
    tag = "_smoke" if SMOKE else ""
    with open(os.path.join(HERE, f"m6h_recalibrate_runs{tag}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["part", "family", "multiplier", "value", "entrance_m", "walkers", "seed", "transit_s",
                    "transit_density", "density", "speed", "share", "lane", "transits", "failed"])
        for k in sorted(cache):
            part, fam, m, v, ent, n, s = k.split("|")
            r = cache[k]
            w.writerow([part, fam, m, v, ent, n, s] + [f"{r[q]:.4f}" for q in
                       ("transit", "transit_density", "density", "speed", "share", "lane")]
                       + [int(r["transits"]), int(r["failed"])])

    # Part B
    lines.append("Part B: held out (fresh seeds; assigned-exit runs never used in the fit)")
    summary = {}
    for fam, m in SETTINGS:
        v = chosen.get((fam, m))
        if v is None:
            continue
        cells = cells_of(cache, "B", fam, m, v)
        nf, nt = n_failed(cache, "B", fam, m, v)
        grid_cells = {c: r for c, r in cells.items() if c[1] in NS}
        coef, rho = G.twin_fit(grid_cells)
        boots = [G.twin_fit(G.resample_cells(grid_cells, rng))[0] for _ in range(B)]
        tlo, thi = float(np.percentile(rho, 5)), float(np.percentile(rho, 95))
        res = {}
        for name, ft in (("free", fr), ("assigned-exit", sym)):
            lo, hi = max(tlo, ft["p05"]), min(thi, ft["p95"])
            gap = G.curve_gap(coef, ft["point"], lo, hi)
            gci = G.ci([G.curve_gap(boots[i], ft["boots"][i], lo, hi) for i in range(B)])
            res[name] = (gap, gci, lo, hi)
        sc_b = score(grid_cells, fr["point"], fr["p05"], fr["p95"])
        lines.append(f"  {NAMES[fam]} x{m}, {PARAM[fam]} = {v:g}: failed {nf}/{nt}; density 5th/95th {tlo:.2f}/{thi:.2f};"
                     f" fresh-seed score {sc_b[0]:.2f} s over {sc_b[1]} cells (Part A {sc_all[(fam, m)][v][0]:.2f},"
                     f" default {sc_all[(fam, m)][DEFAULT[fam]][0]:.2f})")
        for name, (gap, gci, lo, hi) in res.items():
            lines.append(f"    curve gap vs {name} over [{lo:.2f}, {hi:.2f}]: {gap:.2f} s [{gci[0]:.2f}, {gci[1]:.2f}]")
        pts = []
        for run, ent in REAL_RUNS:
            nop = ops[(fam, m)].get(ent)
            if not nop:
                lines.append(f"    {run}: the twin never reached {target[run]:.2f}/m^2 at entrance {ent}")
                pts.append(None)
                continue
            nk = nop - k_of(nop)
            cost, ra, rb = G.cell_cost(cells, ent, nop, nk)
            bc = [G.cell_cost(G.resample_cells({c: cells[c] for c in ((ent, nop), (ent, nk)) if c in cells}, rng),
                              ent, nop, nk)[0] for _ in range(B)]
            tci = G.ci(bc)
            rc = float(G.evalq(fr["point"], ra) - G.evalq(fr["point"], rb))
            rci = G.ci([G.evalq(c, ra) - G.evalq(c, rb) for c in fr["boots"]])
            rs = cells.get((ent, nop), [])
            sh = float(np.nanmean([r["share"] for r in rs])) if rs else float("nan")
            ln = float(np.nanmean([r["lane"] for r in rs])) if rs else float("nan")
            tt = float(np.mean([r["transit"] for r in rs])) if rs else float("nan")
            pts.append(dict(run=run, ent=ent, n=nop, nk=nk, twin=cost, twin_ci=tci, ra=ra, rb=rb, real=rc,
                            real_ci=rci, share=sh, lane=ln, twin_t=tt, real_t=float(G.evalq(fr["point"], ra))))
            lines.append(f"    {run} (entrance {ent}): N {nop} vs {nk}: twin cost {cost:+.2f} s [{tci[0]:+.2f}, {tci[1]:+.2f}]"
                         f" (density {ra:.3f} vs {rb:.3f}); real curve at those densities {rc:+.2f} s"
                         f" [{rci[0]:+.2f}, {rci[1]:+.2f}]; transit twin {tt:.2f} s, real {pts[-1]['real_t']:.2f} s;"
                         f" own-right share {sh:.3f}, lane order {ln:.3f}")
        summary[(fam, m)] = dict(v=v, res=res, pts=pts, sc_b=sc_b)
    lines.append("")
    lines += verdicts(chosen, sc_all, summary)
    out = os.path.join(HERE, f"m6h_recalibrate_results{tag}.txt")
    open(out, "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


def verdicts(chosen, sc_all, summary):
    L_ = ["Registered predictions (LOG.md):"]

    def say(name, text, ok, detail):
        L_.append(f"{name} ({text}): {'held' if ok else 'refuted'} ({detail})")

    try:
        s = list(SETTINGS)
        # R1: chosen value gives less room than the default for sf, cfsm and street-like ORCA
        r1 = [(f, m) for f, m in s if (f, m) != ("orca", 1.0)]
        say("R1", "social force, collision-free speed and street-like ORCA each pick a value giving less room than"
            " the default", all(chosen.get(x) is not None and chosen[x] < DEFAULT[x[0]] for x in r1),
            "; ".join(f"{NAMES[f]} x{m} {chosen.get((f, m))}" for f, m in r1))
        say("R2", "every setting's chosen score is at most half its default score",
            all(np.isfinite(sc_all[x][DEFAULT[x[0]]][0]) and sc_all[x][chosen[x]][0] <= 0.5 * sc_all[x][DEFAULT[x[0]]][0]
                for x in s if chosen.get(x) is not None),
            "; ".join(f"{NAMES[f]} x{m} {sc_all[(f, m)][DEFAULT[f]][0]:.2f} -> "
                      f"{sc_all[(f, m)][chosen[(f, m)]][0]:.2f}" for f, m in s if chosen.get((f, m)) is not None))
        say("R3", "on fresh seeds at least three settings have a free-curve gap below 1.0 s",
            sum(1 for x in summary.values() if x["res"]["free"][0] < 1.0) >= 3,
            "; ".join(f"{NAMES[f]} x{m} {summary[(f, m)]['res']['free'][0]:.2f}" for f, m in summary))
        say("R4", "at least two settings have an assigned-exit curve gap below 1.0 s (held-out runs)",
            sum(1 for x in summary.values() if x["res"]["assigned-exit"][0] < 1.0) >= 2,
            "; ".join(f"{NAMES[f]} x{m} {summary[(f, m)]['res']['assigned-exit'][0]:.2f}" for f, m in summary))
        reach = [(f, m) for f, m in summary if summary[(f, m)]["pts"][1] is not None]
        say("R5", "every chosen twin reaches the dense run's density (bo-360-160-160) within N 120",
            len(reach) == len(summary), "; ".join(f"{NAMES[f]} x{m}" for f, m in reach) or "none")
        inside = []
        for f, m in reach:
            p = summary[(f, m)]["pts"][1]
            inside.append((f, m, p["real_ci"][0] <= p["twin"] <= p["real_ci"][1], p))
        say("R6", "at the dense operating point at least two settings' twin cost lies inside the real cost's interval",
            sum(1 for *_, ok, _ in inside if ok) >= 2,
            "; ".join(f"{NAMES[f]} x{m} twin {p['twin']:+.2f}, real {p['real']:+.2f} [{p['real_ci'][0]:+.2f},"
                      f" {p['real_ci'][1]:+.2f}]" for f, m, _, p in inside))
        r7 = [(f, m, summary[(f, m)]["pts"][1]) for f, m in reach]
        say("R7", "at the dense operating point every chosen twin keeps own-right share above 0.6",
            bool(r7) and all(p["share"] > 0.6 for *_, p in r7),
            "; ".join(f"{NAMES[f]} x{m} {p['share']:.3f}" for f, m, p in r7))
    except (KeyError, TypeError, IndexError) as e:
        L_.append(f"verdicts incomplete: {e!r}")
    return L_


if __name__ == "__main__":
    main()
