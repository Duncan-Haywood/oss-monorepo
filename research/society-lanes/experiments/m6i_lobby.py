"""Milestone 6i: is the twins' density ceiling the entrance rule? Edge entry against a lobby entry.

Predictions E1 to E7 are in LOG.md, written before any number this script prints was read.

6h recalibrated each twin's spacing parameter on the HERMES transit-density curve and found that no
chosen twin reaches the dense run's density (bo-360-160-160, 1.72 /m^2) by N 120: cell density
plateaus near 0.9 to 1.3 /m^2 from N 75 to 90. Its reading was that extra walkers queue at the
entrance: a re-entering walker is placed 0.35 m inside its own end, where the walkers leaving that
end still are, and needs 0.55 m of free space (sftwin.CLEARANCE). This step tests that reading by
changing only where the re-entering walker is placed: entry="lobby" puts it 0.3 to 1.2 m behind the
end (sftwin.LOBBY), in the run-out where leavers have already been removed, over the same entrance
width and with the same clearance.

Settings: the three 6h twins that chose a value (social force 0.75x its fitted bias at A = 1000 N,
collision-free speed 0.5x at T = 0.3 s, ORCA 1.0x at tau = 2 s; 6h's chosen values, not refitted).
Street-like ORCA is left out (its chosen value was the default and it jams).

Part A (SEED 20350000, 6 seeds): entry in {edge, lobby}, entrances 0.9 and 1.6 m, N in NS; 120 s runs,
first 40 s warm-up. Reports per (setting, entry, entrance) cell-mean transit density by N and its
maximum; the 6h calibration score (RMS of cell-mean transit minus the real free-choice curve at the
cell's density, cells inside the real 5th to 95th percentile of density, at least 4 cells); and the
operating N at which cell-mean transit density first reaches each HERMES run's own mean crossing
density (bo-360-090-090 0.830 at 0.9 m; bo-360-160-160 1.721 at 1.6 m; 6g).

Part B (SEED 20351000, 16 fresh seeds, lobby only): N grid plus N_op and N_op - k (k = 20%) at both
entrances; curve gaps against the free-choice and assigned-exit curves; the density cost at each
operating point against the real free curve at the twin's own densities; own-right share and lane
order there.

The real points are 6g's per-walker crossings (m6g_density_cost_real.csv, from doi:10.34735/ped.2009.12
and doi:10.34735/ped.2009.11), read from the committed file because the data host refuses this session.

Writes m6i_lobby_results.txt and m6i_lobby_runs.csv. Needs jupedsim, numpy, numba:
PY=$(python3 platform/ci/pyenv.py jupedsim numpy numba), then "$PY" experiments/m6i_lobby.py
(runs cached in data_cache/m6i_cache.json). M6I_SEEDS and M6I_DURATION shorten a smoke run.
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
import sftwin as S  # noqa: E402

SEED_A, SEED_B = 20350000, 20351000
FULL_A, FULL_B = 6, 16
SEEDS_A = int(os.environ.get("M6I_SEEDS", str(FULL_A)))
SEEDS_B = int(os.environ.get("M6I_SEEDS", str(FULL_B)))
DURATION = float(os.environ.get("M6I_DURATION", str(M5.DURATION)))
SMOKE = (SEEDS_A, SEEDS_B, DURATION) != (FULL_A, FULL_B, M5.DURATION)
# (family, bias multiplier, 6h's chosen spacing value)
SETTINGS = (("sf", 0.75, 1000.0), ("cfsm", 0.5, 0.3), ("orca", 1.0, 2.0))
ENTRIES = S.ENTRIES
ENTRANCES = G.ENTRANCES
NS = (20, 40, 60, 75, 90, 105, 120, 140, 160)
REAL_CSV = os.path.join(HERE, "m6g_density_cost_real.csv")
REAL_RUNS = (("bo-360-090-090", 0.9), ("bo-360-160-160", 1.6))
DENSE = REAL_RUNS[1]
NAMES = G.NAMES
B = G.B


def key(*a):
    return "|".join(str(x) for x in a)


def jobs_a():
    return [(key("A", e, fam, m, v, ent, n, s), fam, ent, n, G.FITTED[fam] * m, v, e, SEED_A + s)
            for fam, m, v in SETTINGS for e in ENTRIES for ent in ENTRANCES for n in NS
            for s in range(SEEDS_A)]


def jobs_b(ops):
    """ops: {(fam, m): {ent: N_op or None}} from Part A's lobby cells."""
    out = []
    for fam, m, v in SETTINGS:
        for ent in ENTRANCES:
            ns = set(NS)
            nop = ops.get((fam, m), {}).get(ent)
            if nop:
                ns |= {nop, nop - H.k_of(nop)}
            for n in sorted(ns):
                for s in range(SEEDS_B):
                    out.append((key("B", "lobby", fam, m, v, ent, n, s), fam, ent, n, G.FITTED[fam] * m, v,
                                "lobby", SEED_B + s))
    return out


def _sim(job):
    k, fam, ent, n, beta, v, entry, seed = job
    kw = dict(duration=DURATION, warmup=M5.WARMUP, entry=entry)
    if fam == "orca":
        import orca as mod
        r = mod.simulate(n, M5.WIDTH, M5.LENGTH, ent, beta, seed, tau=v, **kw)
    else:
        r = S.simulate(n, M5.WIDTH, M5.LENGTH, ent, beta, seed, model=fam, **{H.PARAM[fam]: v}, **kw)
    return k, {q: float(r[q]) for q in ("transit", "transit_density", "density", "speed", "transits",
                                         "failed", "share", "lane")}


def real_points(path=REAL_CSV):
    """{set: {run: [(entry s, transit s, density /m^2), ...]}} from 6g's committed per-walker file."""
    out = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            out.setdefault(row["set"], {}).setdefault(row["run"], []).append(
                (float(row["entry_s"]), float(row["transit_s"]), float(row["density_m2"])))
    return out


def cells_of(cache, part, entry, fam, m, v):
    """{(ent, n): [run dicts]}, failed runs and runs with no crossing dropped."""
    out = {}
    pre = key(part, entry, fam, m, v) + "|"
    for k, r in cache.items():
        if not k.startswith(pre) or r["failed"] or not np.isfinite(r["transit"]):
            continue
        ent, n = k.split("|")[5:7]
        out.setdefault((float(ent), int(n)), []).append(r)
    return out


def n_failed(cache, part, entry, fam, m, v):
    pre = key(part, entry, fam, m, v) + "|"
    rs = [r for k, r in cache.items() if k.startswith(pre)]
    return sum(1 for r in rs if r["failed"]), sum(1 for r in rs if not r["failed"] and not np.isfinite(r["transit"])), len(rs)


def operating_n(cells, ent, target):
    """N at which cell-mean transit density first reaches target, interpolated over NS; None if never."""
    pts = sorted((n, rho) for e, n, rho, _ in H.cell_means(cells) if e == ent and n in NS)
    if pts and pts[0][1] >= target:
        return pts[0][0]
    for (n0, r0), (n1, r1) in zip(pts, pts[1:]):
        if r0 <= target <= r1 and r1 > r0:
            return int(round(n0 + (target - r0) / (r1 - r0) * (n1 - n0)))
    return None


def max_density(cells, ent):
    return max((rho for e, _, rho, _ in H.cell_means(cells) if e == ent), default=float("nan"))


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


def main():
    rng = np.random.default_rng(SEED_A)
    lines = ["Milestone 6i: edge entry against lobby entry in the recalibrated twins (HERMES 3.6 m corridor)",
             f"Part A {SEEDS_A} seeds, Part B {SEEDS_B} fresh seeds; {DURATION:.0f} s runs, warm-up {M5.WARMUP:.0f} s;"
             f" B = {B}; lobby {S.LOBBY[0]}-{S.LOBBY[1]} m behind the end, clearance {S.CLEARANCE} m."
             + ("  SMOKE RUN: not results." if SMOKE else ""), ""]
    real = real_points()
    fits = {s: G.real_fit(runs, rng) for s, runs in real.items()}
    fr, sym = fits["free"], fits["symmetric"]
    target = {run: float(np.mean([p[2] for p in real["free"][run]])) for run, _ in REAL_RUNS}
    lines.append(f"Real free curve: {sum(len(v) for v in real['free'].values())} crossings; density 5th/95th"
                 f" {fr['p05']:.3f}/{fr['p95']:.3f}; T(0.85) {float(G.evalq(fr['point'], 0.85)):.2f} s,"
                 f" T(1.35) {float(G.evalq(fr['point'], 1.35)):.2f} s; assigned-exit"
                 f" {sum(len(v) for v in real['symmetric'].values())} crossings")
    lines.append("Operating densities: " + "; ".join(f"{run} {target[run]:.3f}/m^2" for run, _ in REAL_RUNS))
    lines.append("")

    os.makedirs(M5.CACHE, exist_ok=True)
    cname = f"m6i_smoke_{SEEDS_A}_{SEEDS_B}_{DURATION:.0f}.json" if SMOKE else "m6i_cache.json"
    cpath = os.path.join(M5.CACHE, cname)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    run_all([j for j in jobs_a() if j[0] not in cache], cache, cpath)

    lines.append("Part A: cell-mean transit density by N (runs with no crossing left out), calibration score"
                 f" over cells inside [{fr['p05']:.2f}, {fr['p95']:.2f}] /m^2")
    A, ops = {}, {}
    for fam, m, v in SETTINGS:
        for e in ENTRIES:
            cells = cells_of(cache, "A", e, fam, m, v)
            sc = H.score(cells, fr["point"], fr["p05"], fr["p95"])
            nf, nx, nt = n_failed(cache, "A", e, fam, m, v)
            rec = dict(score=sc, top={}, op={})
            lines.append(f"  {NAMES[fam]} x{m} ({H.PARAM[fam]} {v:g}), {e}: score {sc[0]:.2f} s over {sc[1]} cells;"
                         f" failed {nf}, no crossing {nx}, of {nt}")
            for ent in ENTRANCES:
                cm = {n: rho for en, n, rho, _ in H.cell_means(cells) if en == ent}
                tm = {n: t for en, n, _, t in H.cell_means(cells) if en == ent}
                rec["top"][ent] = max_density(cells, ent)
                run = [r for r, en in REAL_RUNS if en == ent][0]
                rec["op"][ent] = operating_n(cells, ent, target[run])
                lines.append(f"    entrance {ent}: max {rec['top'][ent]:.2f}/m^2; N_op({run}) {rec['op'][ent]}; "
                             + ", ".join(f"N{n} {cm[n]:.2f}/{tm[n]:.1f}s" for n in NS if n in cm))
            A[(fam, m, e)] = rec
        ops[(fam, m)] = A[(fam, m, "lobby")]["op"]
    lines.append("")

    run_all([j for j in jobs_b(ops) if j[0] not in cache], cache, cpath)
    tag = "_smoke" if SMOKE else ""
    with open(os.path.join(HERE, f"m6i_lobby_runs{tag}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["part", "entry", "family", "multiplier", "value", "entrance_m", "walkers", "seed", "transit_s",
                    "transit_density", "density", "speed", "share", "lane", "transits", "failed"])
        for k in sorted(cache):
            r = cache[k]
            w.writerow(k.split("|") + [f"{r[q]:.4f}" for q in
                       ("transit", "transit_density", "density", "speed", "share", "lane")]
                       + [int(r["transits"]), int(r["failed"])])

    lines.append("Part B: lobby entry, fresh seeds")
    summary = {}
    for fam, m, v in SETTINGS:
        cells = cells_of(cache, "B", "lobby", fam, m, v)
        nf, nx, nt = n_failed(cache, "B", "lobby", fam, m, v)
        grid = {c: r for c, r in cells.items() if c[1] in NS}
        if sum(len(r) for r in grid.values()) < 3:
            lines.append(f"  {NAMES[fam]} x{m}: too few runs with a crossing to fit ({nf} failed, {nx} no crossing)")
            summary[(fam, m)] = dict(res={}, pts={}, sc_b=(float("nan"), 0))
            continue
        coef, rho = G.twin_fit(grid)
        boots = [G.twin_fit(G.resample_cells(grid, rng))[0] for _ in range(B)]
        tlo, thi = float(np.percentile(rho, 5)), float(np.percentile(rho, 95))
        res = {}
        for name, ft in (("free", fr), ("assigned-exit", sym)):
            lo, hi = max(tlo, ft["p05"]), min(thi, ft["p95"])
            res[name] = (G.curve_gap(coef, ft["point"], lo, hi),
                         G.ci([G.curve_gap(boots[i], ft["boots"][i], lo, hi) for i in range(B)]), lo, hi)
        sc_b = H.score(grid, fr["point"], fr["p05"], fr["p95"])
        lines.append(f"  {NAMES[fam]} x{m} ({H.PARAM[fam]} {v:g}): failed {nf}, no crossing {nx}, of {nt}; density"
                     f" 5th/95th {tlo:.2f}/{thi:.2f}; fresh-seed score {sc_b[0]:.2f} s over {sc_b[1]} cells")
        for name, (gap, gci, lo, hi) in res.items():
            lines.append(f"    curve gap vs {name} over [{lo:.2f}, {hi:.2f}]: {gap:.2f} s [{gci[0]:.2f}, {gci[1]:.2f}]")
        pts = {}
        for run, ent in REAL_RUNS:
            nop = ops[(fam, m)].get(ent)
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
            sh = float(np.nanmean([r["share"] for r in rs])) if rs else float("nan")
            ln = float(np.nanmean([r["lane"] for r in rs])) if rs else float("nan")
            tt = float(np.mean([r["transit"] for r in rs])) if rs else float("nan")
            pts[run] = dict(n=nop, nk=nk, twin=cost, twin_ci=tci, ra=ra, rb=rb, real=rc, real_ci=rci, share=sh,
                            lane=ln, twin_t=tt, real_t=float(G.evalq(fr["point"], ra)))
            lines.append(f"    {run} (entrance {ent}): N {nop} vs {nk}: twin cost {cost:+.2f} s [{tci[0]:+.2f},"
                         f" {tci[1]:+.2f}] (density {ra:.3f} vs {rb:.3f}); real curve at those densities {rc:+.2f} s"
                         f" [{rci[0]:+.2f}, {rci[1]:+.2f}]; transit twin {tt:.2f} s, real {pts[run]['real_t']:.2f} s;"
                         f" own-right share {sh:.3f}, lane order {ln:.3f}")
        summary[(fam, m)] = dict(res=res, pts=pts, sc_b=sc_b)
    lines.append("")
    lines += verdicts(A, summary, target)
    out = os.path.join(HERE, f"m6i_lobby_results{tag}.txt")
    open(out, "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


def verdicts(A, summary, target):
    L_ = ["Registered predictions (LOG.md):"]

    def say(name, text, ok, detail):
        L_.append(f"{name} ({text}): {'untestable' if ok is None else ('held' if ok else 'refuted')} ({detail})")

    s = [(f, m) for f, m, _ in SETTINGS]
    dense_run, dense_ent = DENSE
    tgt = target[dense_run]
    top = {(f, m, e): A[(f, m, e)]["top"][dense_ent] for f, m in s for e in ENTRIES}
    say("E1", f"edge entry: no setting reaches {tgt:.2f}/m^2 at {dense_ent} m within N {NS[-1]}",
        all(A[(f, m, "edge")]["op"][dense_ent] is None for f, m in s),
        "; ".join(f"{NAMES[f]} x{m} max {top[(f, m, 'edge')]:.2f}" for f, m in s))
    say("E2", f"lobby entry: every setting reaches {tgt:.2f}/m^2 at {dense_ent} m within N {NS[-1]}",
        all(A[(f, m, "lobby")]["op"][dense_ent] is not None for f, m in s),
        "; ".join(f"{NAMES[f]} x{m} max {top[(f, m, 'lobby')]:.2f}, N_op {A[(f, m, 'lobby')]['op'][dense_ent]}"
                  for f, m in s))
    say("E3", f"lobby raises the {dense_ent} m maximum density by at least 0.25/m^2 in every setting",
        all(top[(f, m, "lobby")] - top[(f, m, "edge")] >= 0.25 for f, m in s),
        "; ".join(f"{NAMES[f]} x{m} {top[(f, m, 'lobby')] - top[(f, m, 'edge')]:+.2f}" for f, m in s))
    two = [("cfsm", 0.5), ("orca", 1.0)]
    say("E4", "lobby: collision-free speed and ORCA keep a Part A calibration score below 1.0 s",
        all(A[(f, m, "lobby")]["score"][0] < 1.0 for f, m in two),
        "; ".join(f"{NAMES[f]} x{m} edge {A[(f, m, 'edge')]['score'][0]:.2f}, lobby {A[(f, m, 'lobby')]['score'][0]:.2f}"
                  for f, m in two))
    dp = [(f, m, summary[(f, m)]["pts"].get(dense_run)) for f, m in s]
    reach = [(f, m, p) for f, m, p in dp if p is not None and np.isfinite(p["twin"])]
    say("E5", "dense point: at least one setting's twin cost lies inside the real cost's interval",
        None if not reach else any(p["real_ci"][0] <= p["twin"] <= p["real_ci"][1] for *_, p in reach),
        "; ".join(f"{NAMES[f]} x{m} twin {p['twin']:+.2f}, real {p['real']:+.2f} [{p['real_ci'][0]:+.2f},"
                  f" {p['real_ci'][1]:+.2f}]" for f, m, p in reach) or "no setting reached it")
    say("E6", "dense point: own-right share above 0.6 in every setting that reaches it",
        None if not reach else all(p["share"] > 0.6 for *_, p in reach),
        "; ".join(f"{NAMES[f]} x{m} {p['share']:.3f}" for f, m, p in reach) or "no setting reached it")
    sp = [(f, m, summary[(f, m)]["pts"].get(REAL_RUNS[0][0])) for f, m in two]
    ok7 = [p for *_, p in sp if p is not None and np.isfinite(p["twin"])]
    say("E7", "0.9 m point, lobby: collision-free speed and ORCA both under-price (twin cost below the real interval)",
        None if len(ok7) < 2 else all(p["twin"] < p["real_ci"][0] for p in ok7),
        "; ".join(f"{NAMES[f]} x{m} twin {p['twin']:+.2f}, real [{p['real_ci'][0]:+.2f}, {p['real_ci'][1]:+.2f}]"
                  for f, m, p in sp if p is not None))
    return L_


if __name__ == "__main__":
    main()
