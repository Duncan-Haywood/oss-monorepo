"""Is "collapse is fiscal" built into the closure? (milestone 7, fifth run; plan in LOG.md 2026-11-12).

1. Identity: trajectories depend on (tau, g) only through tau / g.
2. Decomposition of log PSI at collapse times on the fourth run's 576-cell grid:
   log PSI = log(E/E*) + log(s0/w) + log(S*/S) + log(g / (10 tau)), S* = 10 tau / g.
3. Neutral state (g 3, tau 0.3, offset 0): which deviation precedes collapse, and paired levers.
Writes offset_results.txt.

    PYTHONPATH=src python3 experiments/history/run_offset.py
"""
import itertools, sys
from collections import Counter
from multiprocessing import Pool
from pathlib import Path
import numpy as np
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from civ_levers.history import run, A, S0  # noqa: E402
from run_levers import sign_p  # noqa: E402

BURN, ESTAR, RSTAR = 500, 0.05, 1 - A
TERMS = ("elite log(E/E*)", "wage log(s0/w)", "fiscal log(S*/S)", "offset log(g/10tau)")
GRID4 = dict(rho=(0.03, 0.06, 0.12), m=(0.02, 0.05), k=(4, 8), g=(2.0, 4.0, 8.0, 16.0),
             lag=(0, 50, 100, 200), collapse_thr=(0.1, 0.3, 0.5), me=(0.04,))
GRIDN = dict(rho=(0.03, 0.06, 0.12), m=(0.02, 0.05), k=(4, 8), g=(3.0,),
             lag=(0, 50, 100, 200), collapse_thr=(0.1, 0.3, 0.5), me=(0.02, 0.04, 0.08))
LEVERS = {"none": {}, "cap0.06": {"elite_cap": 0.06}, "cap0.05": {"elite_cap": 0.05},
          "cap0.04": {"elite_cap": 0.04}, "welfare0.2": {"welfare": 0.2},
          "welfare0.4": {"welfare": 0.4}}


def cells(grid):
    return [dict(zip(grid, v)) for v in itertools.product(*grid.values())]


def windows(N, E, S, cols, g, tau, welfare, width):
    """Mean of the four log terms over the `width` years strictly before each collapse."""
    w = A * N ** (A - 1) + welfare * (1 - A) * N ** A / N
    sstar = tau * RSTAR / (g * ESTAR)
    T = np.stack([np.log(E / ESTAR), np.log(S0 / w), np.log(sstar / S),
                  np.full(len(N), np.log(1 / sstar))], axis=1)
    out = []
    for c in cols:
        y = int(np.floor(c))
        if y - width >= 0:
            out.append(T[y - width:y].mean(axis=0))
    return out


def one(job):
    c, lev = job[:2]
    reset = job[2] if len(job) > 2 else 1.0
    kw = dict(years=2500, e0f=ESTAR, tau=0.3, plag=c["lag"], psi_reset=reset)
    kw.update(c)
    kw.update(LEVERS[lev])
    t, N, E, S, psi = run(**kw)
    cols = [x for x in run.collapses if x >= BURN]
    wel = LEVERS[lev].get("welfare", 0.0)
    gaps = np.diff(cols)
    return {"ncol": len(cols), "floor": int((gaps < 51).sum()), "ngap": len(gaps),
            "w25": windows(N, E, S, cols, c["g"], 0.3, wel, 25),
            "w100": windows(N, E, S, cols, c["g"], 0.3, wel, 100)}


def drivers(res, key, dynamic):
    """Per collapsing cell: which term has the largest mean over its pre-collapse windows."""
    cnt = Counter()
    for r in res:
        if r["ncol"] and r[key]:
            m = np.mean(r[key], axis=0)
            j = int(np.argmax(m[:3])) if dynamic else int(np.argmax(m))
            cnt[TERMS[j]] += 1
    return cnt


def fmt(cnt):
    n = sum(cnt.values())
    return f"{n} cells: " + ", ".join(f"{t} {cnt.get(t, 0)} ({cnt.get(t, 0) / max(n, 1):.2f})" for t in TERMS)


def mean_terms(res, key):
    W = [np.mean(r[key], axis=0) for r in res if r["ncol"] and r[key]]
    return "  ".join(f"{t} {v:+.3f}" for t, v in zip(TERMS, np.mean(W, axis=0))) if W else "none"


def identity():
    kw = dict(years=2500, rho=0.03, m=0.05, k=8, lag=200, plag=200, collapse_thr=0.5)
    a = run(tau=0.3, g=16.0, **kw); ca = list(run.collapses)
    b = run(tau=0.45, g=24.0, **kw); cb = list(run.collapses)
    d = max(float(np.max(np.abs(x - y))) for x, y in zip(a[1:], b[1:]))
    return d, ca == cb, len(ca)


def main():
    out = ["civ-history: is fiscal collapse built into the closure? (run_offset.py; do not edit by hand)",
           f"2500 years, first {BURN} dropped; deterministic, one run per cell", ""]
    d, same, n = identity()
    out.append(f"H1 identity: run(tau 0.3, g 16) vs run(tau 0.45, g 24): max |diff| over N, E, S, psi = {d:.2e}; "
               f"collapse years identical: {same} ({n} collapses)")
    out.append("")
    c4, cn = cells(GRID4), cells(GRIDN)
    jobs = [(c, "none") for c in c4] + [(c, lev) for c in cn for lev in LEVERS]
    with Pool() as pool:
        res = pool.map(one, jobs, chunksize=8)
    r4 = res[:len(c4)]
    rn = {(i, lev): res[len(c4) + i * len(LEVERS) + j] for i in range(len(cn)) for j, lev in enumerate(LEVERS)}
    out.append(f"Fourth-run grid {GRID4}")
    out.append(f"cells that collapse: {sum(r['ncol'] > 0 for r in r4)} of {len(c4)}")
    for key in ("w25", "w100"):
        out.append(f"[{key}] mean log terms before collapse: {mean_terms(r4, key)}")
        out.append(f"[{key}] largest of four (H2): {fmt(drivers(r4, key, False))}")
        out.append(f"[{key}] largest dynamic (H3): {fmt(drivers(r4, key, True))}")
    out.append("By state cost g, [w25] mean log terms before collapse:")
    for g in GRID4["g"]:
        sub = [r for c, r in zip(c4, r4) if c["g"] == g]
        out.append(f"  g {g:4.0f}: collapsing {sum(r['ncol'] > 0 for r in sub):3d} of {len(sub)}; {mean_terms(sub, 'w25')}")
    out.append("")
    base = [rn[(i, 'none')] for i in range(len(cn))]
    coll = [i for i in range(len(cn)) if base[i]["ncol"] > 0]
    out.append(f"Neutral state (offset 0) grid {GRIDN}")
    out.append(f"cells that collapse with no lever: {len(coll)} of {len(cn)}")
    for key in ("w25", "w100"):
        out.append(f"[{key}] mean log terms before collapse: {mean_terms(base, key)}")
        out.append(f"[{key}] largest dynamic (H4): {fmt(drivers(base, key, True))}")
    out.append("By elite mortality me, collapsing cells and [w25] largest dynamic:")
    for me in GRIDN["me"]:
        sub = [base[i] for i in range(len(cn)) if cn[i]["me"] == me]
        out.append(f"  me {me:.2f}: collapsing {sum(r['ncol'] > 0 for r in sub):3d} of {len(sub)}; {fmt(drivers(sub, 'w25', True))}")
    out.append("By elite lag, collapsing cells and [w25] largest dynamic:")
    for lag in GRIDN["lag"]:
        sub = [base[i] for i in range(len(cn)) if cn[i]["lag"] == lag]
        out.append(f"  lag {lag:3d}: collapsing {sum(r['ncol'] > 0 for r in sub):3d} of {len(sub)}; {fmt(drivers(sub, 'w25', True))}")
    out.append("")
    out.append("Neutral state, levers paired by cell (cells that collapse with no lever) (H5):")
    out.append("lever       | fewer  same  more | sign p   | cut by >=2 | stopped | started in quiet")
    quiet = [i for i in range(len(cn)) if base[i]["ncol"] == 0]
    for lev in LEVERS:
        if lev == "none":
            continue
        dd = [rn[(i, lev)]["ncol"] - base[i]["ncol"] for i in coll]
        fewer = sum(x < 0 for x in dd); more = sum(x > 0 for x in dd)
        out.append(f"{lev:11s} | {fewer:5d} {len(dd) - fewer - more:5d} {more:5d} | {sign_p(fewer, fewer + more):8.2g} | "
                   f"{sum(x <= -2 for x in dd):4d} ({sum(x <= -2 for x in dd) / max(len(dd), 1):.2f}) | "
                   f"{sum(rn[(i, lev)]['ncol'] == 0 for i in coll):7d} | {sum(rn[(i, lev)]['ncol'] > 0 for i in quiet):5d}")
    out.append("")
    out.append("Not pre-registered, added after seeing the above: does the collapse reset sustain itself?")
    out.append("A collapse resets the lagged stress (plag > 0) to PSI = 1, where psi = 0.5, at or above every")
    out.append("threshold swept. Variants: psi_reset 0 (memory cleared to calm) and None (memory kept).")
    out.append("collapsing cells (share of gaps between collapses at the 50-year refractory floor) by lag:")
    resets = (1.0, 0.0, None)
    for gname, cs in (("fourth-run grid", c4), ("neutral grid", cn)):
        jobs = [(c, "none", rs) for rs in resets for c in cs]
        with Pool() as pool:
            rr = pool.map(one, jobs, chunksize=8)
        for k_, rs in enumerate(resets):
            sub = rr[k_ * len(cs):(k_ + 1) * len(cs)]
            parts = []
            for lag in (0, 50, 100, 200):
                ss = [r for c, r in zip(cs, sub) if c["lag"] == lag]
                fl = sum(r["floor"] for r in ss); ng = sum(r["ngap"] for r in ss)
                parts.append(f"lag {lag}: {sum(r['ncol'] > 0 for r in ss)} ({fl / max(ng, 1):.2f})")
            out.append(f"  {gname:15s} reset {str(rs):4s}: total {sum(r['ncol'] > 0 for r in sub):3d} of {len(cs)}; " + "; ".join(parts))
            if gname == "fourth-run grid":
                out.append("      by g: " + ", ".join(
                    f"g {g:.0f} {sum(r['ncol'] > 0 for c, r in zip(cs, sub) if c['g'] == g)}" for g in GRID4["g"]))
            out.append(f"      [w25] largest dynamic: {fmt(drivers(sub, 'w25', True))}")
            out.append(f"      [w25] mean log terms: {mean_terms(sub, 'w25')}")
    (HERE / "offset_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
