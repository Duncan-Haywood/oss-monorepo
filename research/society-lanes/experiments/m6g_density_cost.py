"""Milestone 6g: what does an extra walker really cost? Each twin's density cost against HERMES.

Predictions D1 to D7 are in LOG.md, written before any number this script prints was read.

6f found the twins agree on what a crowd-side robot does to people and disagree by about 6x on what any
extra body costs in the 3.6 m corridor. This step measures that cost on real trajectories.

Part A (real): the five free-choice 3.6 m HERMES runs (doi:10.34735/ped.2009.12) and, as a robustness
check, the seven symmetric 3.6 m runs (doi:10.34735/ped.2009.11). Milestone 1's walker filter (lanes.walkers),
the twins' transit definition (section samples spanning 7.5 m of the 8 m), and for each crossing walker the
section density it saw (counted walkers in the section, averaged over its own frames, over 8 m x width).
Transit T(rho) = a + b rho + c rho^2 is fitted to the per-walker points; the interval resamples walkers in
10 s blocks of entry time within each run (B = 2000), conditional on the runs.

Part B (twins): people only; social force at 0.75x its fitted bias, collision-free speed at 0.5x, ORCA at
0.02x and 1.0x (6f's settings); entrances 0.9 and 1.6 m; N in NS; 20 fresh seeds per cell (SEED0 20330000);
120 s runs, first 40 s warm-up; 80 cells, 1600 runs. Each run gives (transit_density, transit). The same
quadratic is fitted per setting over both entrances; intervals bootstrap seeds within cells.

Comparisons: (i) density cost at 6f's operating points, the twin's cell-mean T(N) - T(N - k) against the
real curve's T(rho_N) - T(rho_{N-k}) at the densities the twin produced, only where both lie inside the real
walkers' 5th to 95th density percentile; (ii) curve gap, the RMS difference of the fitted T(rho) on a
0.05 /m^2 grid over the range both cover (5th to 95th percentile of each side's densities).

Writes m6g_density_cost_results.txt, m6g_density_cost_runs.csv (twin runs) and m6g_density_cost_real.csv
(per-walker real points). Needs jupedsim, numpy, numba:
PY=$(python3 platform/ci/pyenv.py jupedsim numpy numba), then "$PY" experiments/m6g_density_cost.py
(twin runs cached in data_cache/m6g_cache.json). M6G_SEEDS and M6G_DURATION shorten a smoke run.
"""
from __future__ import annotations

import csv
import io
import json
import multiprocessing as mp
import os
import sys
import zipfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import lanes as L  # noqa: E402
import m1_hermes_sides as M1  # noqa: E402
import m5_robots as M5  # noqa: E402
import sftwin as S  # noqa: E402

SEED0 = 20330000
FULL_SEEDS = 20
SEEDS = int(os.environ.get("M6G_SEEDS", str(FULL_SEEDS)))
DURATION = float(os.environ.get("M6G_DURATION", str(M5.DURATION)))
SMOKE = (SEEDS, DURATION) != (FULL_SEEDS, M5.DURATION)
FITTED = {"sf": 0.1, "cfsm": 0.2, "orca": 1.0}
SETTINGS = [("sf", 0.75), ("cfsm", 0.5), ("orca", 0.02), ("orca", 1.0)]
ENTRANCES = (0.9, 1.6)
NS = (10, 16, 20, 24, 30, 40, 48, 60, 75, 90)
# 6f's operating points: (entrance, N) per family; control has N - k walkers, k = 20% of N
NCOUNT = {"sf": (30, 60), "cfsm": (20, 60), "orca": (30, 60)}
SHARE = 0.20
WIDTH = 3.6
B = 2000
BLOCK_S = 10.0
GRID = 0.05
NAMES = {"sf": "social force", "cfsm": "collision-free speed", "orca": "ORCA"}
REAL_SETS = {"free": 3.6, "symmetric": 3.6}


def key(*a):
    return "|".join(str(x) for x in a)


def k_of(n):
    return M5.n_robots(n, SHARE)


def operating_points(fam):
    """[(entrance, N, N - k)] for 6f's two runs of this family."""
    return [(ent, n, n - k_of(n)) for (run, ent, _), n in zip(M5.RUNS, NCOUNT[fam])]


def jobs():
    out = []
    for fam, m in SETTINGS:
        for ent in ENTRANCES:
            for n in NS:
                for s in range(SEEDS):
                    out.append((key(fam, m, ent, n, s), fam, ent, n, FITTED[fam] * m, SEED0 + s))
    return out


def _sim(job):
    k, fam, ent, n, beta, seed = job
    kw = dict(duration=DURATION, warmup=M5.WARMUP)
    if fam == "orca":
        import orca as mod
        r = mod.simulate(n, M5.WIDTH, M5.LENGTH, ent, beta, seed, **kw)
    else:
        r = S.simulate(n, M5.WIDTH, M5.LENGTH, ent, beta, seed, model=fam, **kw)
    return k, {q: float(r[q]) for q in ("transit", "transit_density", "density", "speed", "transits",
                                         "failed")}


# ---------------------------------------------------------------- real data
def crossings(ws, fps, width_m, transit_min_cm=S.TRANSIT_MIN * 100.0, half_cm=S.SECTION_HALF * 100.0):
    """Per crossing walker: (entry time s, transit s, density it saw /m^2), the twins' definitions.

    ws: lanes.walkers output {pid: (dir, [(frame, x_cm, y_cm), ...])}, y along the corridor."""
    n_sec = {}
    for _, s in ws.values():
        for f, _, _ in s:
            n_sec[f] = n_sec.get(f, 0) + 1
    area = 2 * half_cm / 100.0 * width_m
    out = []
    for _, s in ws.values():
        if abs(s[-1][2] - s[0][2]) < transit_min_cm:
            continue
        out.append((s[0][0] / fps, (s[-1][0] - s[0][0]) / fps,
                    sum(n_sec[f] for f, _, _ in s) / len(s) / area))
    return out


def real_points():
    """{set: {run: [(t0, transit, rho), ...]}} for the 3.6 m runs of each set."""
    out = {}
    for key_, (doi, name) in M1.SETS.items():
        if key_ not in REAL_SETS:
            continue
        blobs = M1.fetch(name)
        meta = json.loads(blobs["_metadata.json"])["experiment"]
        runs = {r["run_name"]: r for r in meta["run"]}
        zf = zipfile.ZipFile(io.BytesIO(blobs["_trajectories_txt.zip"]))
        out[key_] = {}
        for fn in sorted(zf.namelist()):
            run = os.path.splitext(os.path.basename(fn))[0]
            if not run:
                continue
            w = float(runs[run]["parameter"]["corridor_width [m]"])
            if w != REAL_SETS[key_]:
                continue
            text = io.TextIOWrapper(zf.open(fn), encoding="utf-8", errors="replace")
            ws = L.walkers(L.parse_trajectories(text), w * 100.0)
            out[key_][run] = crossings(ws, M1.FPS, w)
    return out


def fit_quad(rho, t):
    """Least-squares T = a + b rho + c rho^2; returns (a, b, c)."""
    rho, t = np.asarray(rho, float), np.asarray(t, float)
    X = np.column_stack([np.ones_like(rho), rho, rho ** 2])
    coef, *_ = np.linalg.lstsq(X, t, rcond=None)
    return coef


def evalq(c, rho):
    rho = np.asarray(rho, float)
    return c[0] + c[1] * rho + c[2] * rho ** 2


def block_resample(runs, rng):
    """Resample walkers in BLOCK_S blocks of entry time, within each run; returns (rho, t) arrays."""
    rho, t = [], []
    for pts in runs.values():
        if not pts:
            continue
        blocks = {}
        for t0, tr, r in pts:
            blocks.setdefault(int(t0 // BLOCK_S), []).append((tr, r))
        bl = list(blocks.values())
        for i in rng.integers(0, len(bl), len(bl)):
            for tr, r in bl[i]:
                t.append(tr)
                rho.append(r)
    return np.array(rho), np.array(t)


def real_fit(runs, rng):
    pts = [p for v in runs.values() for p in v]
    rho = np.array([p[2] for p in pts])
    t = np.array([p[1] for p in pts])
    point = fit_quad(rho, t)
    boots = np.array([fit_quad(*block_resample(runs, rng)) for _ in range(B)])
    return dict(point=point, boots=boots, rho=rho, t=t,
                p05=float(np.percentile(rho, 5)), p95=float(np.percentile(rho, 95)),
                median=float(np.median(rho)))


def ci(v):
    v = np.asarray(v, float)
    v = v[np.isfinite(v)]
    if not len(v):
        return float("nan"), float("nan")
    return float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))


def slope(c, rho):
    return c[1] + 2 * c[2] * rho


# ---------------------------------------------------------------- twin side
def twin_tables(res):
    """{(fam, m): {(ent, n): [run dicts]}}, failed runs dropped."""
    out = {}
    for k, r in res.items():
        fam, m, ent, n, s = k.split("|")
        if r["failed"] or not np.isfinite(r["transit"]):
            continue
        out.setdefault((fam, float(m)), {}).setdefault((float(ent), int(n)), []).append(r)
    return out


def twin_fit(cells, rng=None):
    rs = [r for v in cells.values() for r in v]
    rho = np.array([r["transit_density"] for r in rs])
    t = np.array([r["transit"] for r in rs])
    return fit_quad(rho, t), rho


def resample_cells(cells, rng):
    return {c: [v[i] for i in rng.integers(0, len(v), len(v))] for c, v in cells.items()}


def cell_cost(cells, ent, n, nk):
    a, b = cells.get((ent, n), []), cells.get((ent, nk), [])
    if not a or not b:
        return float("nan"), float("nan"), float("nan")
    ta = np.mean([r["transit"] for r in a])
    tb = np.mean([r["transit"] for r in b])
    ra = np.mean([r["transit_density"] for r in a])
    rb = np.mean([r["transit_density"] for r in b])
    return float(ta - tb), float(ra), float(rb)


def curve_gap(c_twin, c_real, lo, hi):
    if hi <= lo:
        return float("nan")
    g = np.arange(lo, hi + 1e-9, GRID)
    return float(np.sqrt(np.mean((evalq(c_twin, g) - evalq(c_real, g)) ** 2)))


# ---------------------------------------------------------------- main
def main():
    rng = np.random.default_rng(SEED0)
    lines = ["Milestone 6g: each twin's density cost against the HERMES transit-density curve (3.6 m corridor)",
             f"Twin runs: {SEEDS} seeds x {len(SETTINGS) * len(ENTRANCES) * len(NS)} cells, {DURATION:.0f} s,"
             f" warm-up {M5.WARMUP:.0f} s. B = {B}." + ("  SMOKE RUN: not results." if SMOKE else ""), ""]

    # Part A
    real = real_points()
    fits = {s: real_fit(runs, rng) for s, runs in real.items()}
    with open(os.path.join(HERE, "m6g_density_cost_real.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["set", "run", "entry_s", "transit_s", "density_m2"])
        for s, runs in real.items():
            for run, pts in runs.items():
                for t0, tr, r in pts:
                    w.writerow([s, run, f"{t0:.2f}", f"{tr:.3f}", f"{r:.4f}"])
    lines.append("Part A: real crossings (HERMES 3.6 m), T(rho) = a + b rho + c rho^2 fitted per walker")
    for s, ft in fits.items():
        runs = real[s]
        lines.append(f"  {s}: {sum(len(v) for v in runs.values())} crossings in {len(runs)} runs; density 5th/50th/95th"
                     f" pct {ft['p05']:.3f}/{ft['median']:.3f}/{ft['p95']:.3f} /m^2; coef "
                     + ", ".join(f"{x:+.3f}" for x in ft["point"]))
        for run, pts in runs.items():
            if pts:
                lines.append(f"    {run}: {len(pts)} crossings, mean density {np.mean([p[2] for p in pts]):.3f},"
                             f" mean transit {np.mean([p[1] for p in pts]):.2f} s")
        g = np.arange(round(ft["p05"] / GRID) * GRID, ft["p95"] + 1e-9, 0.25)
        for x in g:
            v = [evalq(c, x) for c in ft["boots"]]
            lo, hi = ci(v)
            lines.append(f"    T({x:.2f}) = {float(evalq(ft['point'], x)):.2f} s [{lo:.2f}, {hi:.2f}]")
    fr = fits["free"]
    sl = slope(fr["point"], fr["median"])
    sl_ci = ci([slope(c, fr["median"]) for c in fr["boots"]])
    lines.append(f"  free: dT/drho at the median density {fr['median']:.3f}: {sl:+.3f} s per /m^2 [{sl_ci[0]:+.3f}, {sl_ci[1]:+.3f}]")
    lines.append("")

    # Part B
    os.makedirs(M5.CACHE, exist_ok=True)
    cname = f"m6g_smoke_{SEEDS}_{DURATION:.0f}.json" if SMOKE else "m6g_cache.json"
    cpath = os.path.join(M5.CACHE, cname)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    todo = [j for j in jobs() if j[0] not in cache]
    if todo:
        with mp.Pool(max(1, (os.cpu_count() or 2))) as pool:
            for i, (k, r) in enumerate(pool.imap_unordered(_sim, todo, chunksize=2)):
                cache[k] = r
                if i % 50 == 0:
                    json.dump(cache, open(cpath, "w"))
                    print(f"{i + 1}/{len(todo)}", flush=True)
        json.dump(cache, open(cpath, "w"))
    tag = "_smoke" if SMOKE else ""
    with open(os.path.join(HERE, f"m6g_density_cost_runs{tag}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["family", "multiplier", "entrance_m", "walkers", "seed", "transit_s", "transit_density",
                    "density", "speed", "transits", "failed"])
        for k in sorted(cache):
            fam, m, ent, n, s = k.split("|")
            r = cache[k]
            w.writerow([fam, m, ent, n, s] + [f"{r[q]:.4f}" for q in ("transit", "transit_density", "density",
                                                                       "speed")] + [int(r["transits"]), int(r["failed"])])
    tabs = twin_tables(cache)
    nfail = sum(1 for r in cache.values() if r["failed"])
    lines.append(f"Part B: twin runs {len(cache)}, failed {nfail}")
    summary = {}
    for fam, m in SETTINGS:
        cells = tabs.get((fam, m), {})
        if not cells:
            continue
        coef, rho = twin_fit(cells)
        boots = [twin_fit(resample_cells(cells, rng))[0] for _ in range(B)]
        tlo, thi = float(np.percentile(rho, 5)), float(np.percentile(rho, 95))
        lo, hi = max(tlo, fr["p05"]), min(thi, fr["p95"])
        gap = curve_gap(coef, fr["point"], lo, hi)
        gap_ci = ci([curve_gap(boots[i], fr["boots"][i], lo, hi) for i in range(B)])
        lines.append(f"  {NAMES[fam]} x{m}: density 5th/95th {tlo:.3f}/{thi:.3f}; coef "
                     + ", ".join(f"{x:+.3f}" for x in coef)
                     + f"; curve gap vs free over [{lo:.2f}, {hi:.2f}]: {gap:.2f} s [{gap_ci[0]:.2f}, {gap_ci[1]:.2f}]")
        for ent in ENTRANCES:
            row = []
            for n in NS:
                rs = cells.get((ent, n), [])
                if rs:
                    row.append(f"N{n}: {np.mean([r['transit_density'] for r in rs]):.2f}/m2"
                               f" {np.mean([r['transit'] for r in rs]):.2f}s")
            lines.append(f"    entrance {ent}: " + "; ".join(row))
        pts = []
        for ent, n, nk in operating_points(fam):
            cost, ra, rb = cell_cost(cells, ent, n, nk)
            bc = []
            for _ in range(B):
                bc.append(cell_cost(resample_cells({c: cells[c] for c in ((ent, n), (ent, nk)) if c in cells},
                                                   rng), ent, n, nk)[0])
            tci = ci(bc)
            inside = fr["p05"] <= min(ra, rb) and max(ra, rb) <= fr["p95"]
            rc = float(evalq(fr["point"], ra) - evalq(fr["point"], rb))
            rci = ci([evalq(c, ra) - evalq(c, rb) for c in fr["boots"]])
            sym = fits.get("symmetric")
            sc = float(evalq(sym["point"], ra) - evalq(sym["point"], rb)) if sym else float("nan")
            pts.append(dict(ent=ent, n=n, nk=nk, twin=cost, twin_ci=tci, ra=ra, rb=rb, inside=inside,
                            real=rc, real_ci=rci, sym=sc, twin_t=float(np.mean([r["transit"] for r in cells.get((ent, n), [])] or [np.nan])),
                            real_t=float(evalq(fr["point"], ra))))
            lines.append(f"    cost at entrance {ent}, N {n} vs {nk}: twin {cost:+.2f} s [{tci[0]:+.2f}, {tci[1]:+.2f}]"
                         f" (density {ra:.3f} vs {rb:.3f}); real (free) at those densities {rc:+.2f} s"
                         f" [{rci[0]:+.2f}, {rci[1]:+.2f}]{'' if inside else ' OUTSIDE the real 5-95% range'};"
                         f" symmetric {sc:+.2f} s; transit at N: twin {pts[-1]['twin_t']:.2f} s, real curve"
                         f" {pts[-1]['real_t']:.2f} s")
        summary[(fam, m)] = dict(gap=gap, gap_ci=gap_ci, pts=pts)
    lines.append("")
    lines += verdicts(fr, sl_ci, summary)
    out = os.path.join(HERE, f"m6g_density_cost_results{tag}.txt")
    open(out, "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


def p60(summary, fam, m):
    for p in summary[(fam, m)]["pts"]:
        if p["n"] == 60:
            return p
    return None


def verdicts(fr, sl_ci, summary):
    L_ = ["Registered predictions (LOG.md):"]

    def say(name, text, ok, detail):
        L_.append(f"{name} ({text}): {'held' if ok else 'refuted'} ({detail})")

    say("D1", "real dT/drho at the median density has an interval above 0", sl_ci[0] > 0,
        f"[{sl_ci[0]:+.3f}, {sl_ci[1]:+.3f}]")
    try:
        sf, os_ = p60(summary, "sf", 0.75), p60(summary, "orca", 0.02)
        lo, hi = sorted([sf["twin"], os_["twin"]])
        say("D2", "real cost at N 60 between social force's and street-like ORCA's twin costs",
            lo <= sf["real"] <= hi and lo <= os_["real"] <= hi,
            f"sf {sf['twin']:+.2f} (real {sf['real']:+.2f}), ORCA x0.02 {os_['twin']:+.2f} (real {os_['real']:+.2f})")
        gaps = {k: v["gap"] for k, v in summary.items()}
        best = min(gaps, key=lambda k: gaps[k] if np.isfinite(gaps[k]) else 1e9)
        say("D3", "collision-free speed has the smallest curve gap", best == ("cfsm", 0.5),
            "; ".join(f"{NAMES[f]} x{m} {g:.2f} s" for (f, m), g in gaps.items()))
        say("D4", "social force twin cost at N 60 below the real cost's interval", sf["twin"] < sf["real_ci"][0],
            f"twin {sf['twin']:+.2f}, real {sf['real']:+.2f} [{sf['real_ci'][0]:+.2f}, {sf['real_ci'][1]:+.2f}]"
            + ("" if sf["inside"] else ", densities outside the real range"))
        say("D5", "street-like ORCA twin cost at N 60 above the real cost's interval", os_["twin"] > os_["real_ci"][1],
            f"twin {os_['twin']:+.2f}, real {os_['real']:+.2f} [{os_['real_ci'][0]:+.2f}, {os_['real_ci'][1]:+.2f}]"
            + ("" if os_["inside"] else ", densities outside the real range"))
        say("D6", "every setting's curve gap exceeds 0.5 s", all(g > 0.5 for g in gaps.values()),
            "; ".join(f"{g:.2f}" for g in gaps.values()))
        d7 = [(p60(summary, f, m)) for f, m in summary]
        ok = all(abs(p["sym"] - p["real"]) <= 0.3 * abs(p["real"]) for p in d7)
        say("D7", "symmetric runs' cost at N 60 within 30% of the free runs' cost", ok,
            "; ".join(f"{NAMES[f]} x{m}: free {p['real']:+.2f}, symmetric {p['sym']:+.2f}"
                      for (f, m), p in zip(summary, d7)))
    except (KeyError, TypeError) as e:
        L_.append(f"verdicts incomplete: {e!r}")
    return L_


if __name__ == "__main__":
    main()
