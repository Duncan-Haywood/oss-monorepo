"""Do the levers change collapses cell by cell? Paired comparison over the collapse grid.
Writes levers_results.txt (milestone 7, fourth run; plan in LOG.md 2026-11-12).

    PYTHONPATH=src python3 experiments/history/run_levers.py
"""
import itertools, sys
from math import comb
from multiprocessing import Pool
from pathlib import Path
import numpy as np
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from civ_levers.history import run, summary, A, S0  # noqa: E402

GRID = dict(rho=(0.03, 0.06, 0.12), m=(0.02, 0.05), k=(4, 8), g=(2.0, 4.0, 8.0, 16.0),
            lag=(0, 50, 100, 200), collapse_thr=(0.1, 0.3, 0.5))
LEVERS = {"none": {},
          "cap0.10": {"elite_cap": 0.10}, "cap0.08": {"elite_cap": 0.08},
          "cap0.06": {"elite_cap": 0.06}, "cap0.05": {"elite_cap": 0.05},
          "cap0.04": {"elite_cap": 0.04},
          "welfare0.1": {"welfare": 0.1}, "welfare0.2": {"welfare": 0.2},
          "welfare0.4": {"welfare": 0.4},
          "tau0.2": {"tau": 0.2}, "tau0.45": {"tau": 0.45}}
BURN = 500
keys = list(GRID)
CELLS = [dict(zip(keys, v)) for v in itertools.product(*GRID.values())]


def one(job):
    ci, name = job
    c, lev = CELLS[ci], LEVERS[name]
    kw = dict(years=2500, e0f=0.05, me=0.04, tau=0.3, plag=c["lag"])
    kw.update(c)
    kw.update(lev)
    t, N, E, S, psi = run(**kw)
    col = [x for x in run.collapses if x >= BURN]
    s = summary(t, N, E, S, psi, burn=BURN)
    wel = lev.get("welfare", 0.0)
    n = N[BURN:]
    income = A * n ** (A - 1) + wel * (1 - A) * n ** A / n
    cap = lev.get("elite_cap")
    return ci, name, {"ncol": len(col), "n_mean": float(n.mean()), "n_cv": s["n_cv"],
                      "psi_mean": s["psi_mean"], "income_ratio": float(income.mean() / S0),
                      "e_mean": float(E[BURN:].mean()),
                      # log PSI = log(E/E*) + log(s0/w) + log(1/S): mean of each term after burn-in
                      "lpsi": (float(np.log(E[BURN:] / 0.05).mean()), float(np.log(S0 / income).mean()),
                               float(-np.log(S[BURN:]).mean())),
                      "cap_binding": float((E[BURN:] >= cap * 0.999).mean()) if cap else 0.0}


def sign_p(k, n):
    """Two-sided exact sign test: k successes of n non-ties at p = 1/2."""
    if n == 0:
        return 1.0
    tail = sum(comb(n, i) for i in range(min(k, n - k) + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def main():
    jobs = [(ci, name) for ci in range(len(CELLS)) for name in LEVERS]
    with Pool() as pool:
        res = pool.map(one, jobs, chunksize=16)
    R = {(ci, name): r for ci, name, r in res}
    base = {ci: R[(ci, "none")] for ci in range(len(CELLS))}
    coll = [ci for ci in base if base[ci]["ncol"] > 0]
    quiet = [ci for ci in base if base[ci]["ncol"] == 0]
    out = ["civ-history lever results, paired by cell (run_levers.py; do not edit by hand)",
           f"{len(CELLS)} cells; 2500 years, first {BURN} dropped; grid {GRID}",
           f"cells that collapse with no lever: {len(coll)}; quiet cells: {len(quiet)}", "",
           "Among cells that collapse with no lever (paired with the same cell's no-lever run):",
           "lever       | fewer  same  more | sign p   | cut by >=2 | stopped | mean dN/N0 | pooled mean (cells that collapse) | started in quiet | cap binding",
           ]
    pooled_none = np.mean([base[ci]["ncol"] for ci in coll])
    for name in LEVERS:
        if name == "none":
            out.append(f"{'none':11s} |                  |          |            |         |            | {pooled_none:6.2f} ({len(coll)} cells)")
            continue
        d = [R[(ci, name)]["ncol"] - base[ci]["ncol"] for ci in coll]
        fewer = sum(x < 0 for x in d); more = sum(x > 0 for x in d); same = len(d) - fewer - more
        cut2 = sum(x <= -2 for x in d)
        stopped = sum(R[(ci, name)]["ncol"] == 0 for ci in coll)
        dn = np.mean([R[(ci, name)]["n_mean"] / base[ci]["n_mean"] - 1 for ci in coll])
        started = [ci for ci in quiet if R[(ci, name)]["ncol"] > 0]
        now = [R[(ci, name)]["ncol"] for ci in range(len(CELLS)) if R[(ci, name)]["ncol"] > 0]
        pooled = np.mean(now) if now else 0.0
        bind = np.mean([R[(ci, name)]["cap_binding"] for ci in coll])
        out.append(f"{name:11s} | {fewer:5d} {same:5d} {more:5d} | {sign_p(fewer, fewer + more):8.2g} | "
                   f"{cut2:4d} ({cut2 / len(coll):.2f}) | {stopped:7d} | {dn:+10.3f} | "
                   f"{pooled:6.2f} ({len(now)} cells)                | {len(started):5d}            | {bind:.2f}")
    out.append("")
    out.append("Welfare and Malthusian absorption, cells that collapse with no lever:")
    for name in ("none", "welfare0.1", "welfare0.2", "welfare0.4"):
        inc = [R[(ci, name)]["income_ratio"] for ci in coll]
        nm = [R[(ci, name)]["n_mean"] for ci in coll]
        within = np.mean([abs(x - 1) <= 0.10 for x in inc])
        out.append(f"{name:11s}: mean peasant income / subsistence {np.mean(inc):.3f} "
                   f"(share of cells within 10%: {within:.2f}); mean population {np.mean(nm):.3f}")
    out.append("")
    out.append("Elite cap 0.06 by elite lag (cells that collapse with no lever): fewer / same / more, stopped")
    for lag in GRID["lag"]:
        cs = [ci for ci in coll if CELLS[ci]["lag"] == lag]
        d = [R[(ci, "cap0.06")]["ncol"] - base[ci]["ncol"] for ci in cs]
        out.append(f"lag {lag:3d}: n {len(cs):3d}  {sum(x < 0 for x in d):3d} / {sum(x == 0 for x in d):3d} / "
                   f"{sum(x > 0 for x in d):3d}, stopped {sum(R[(ci, 'cap0.06')]['ncol'] == 0 for ci in cs)}")
    out.append("")
    out.append("What drives stress: mean of the three log terms of PSI = (E/E*)(s0/w)/S, no lever")
    for lab, cs in (("collapse", coll), ("quiet", quiet)):
        L = np.array([base[ci]["lpsi"] for ci in cs])
        out.append(f"{lab:8s} cells ({len(cs)}): log(E/E*) {L[:, 0].mean():+.3f}  log(s0/w) {L[:, 1].mean():+.3f}  "
                   f"log(1/S) {L[:, 2].mean():+.3f}")
    out.append("Cells that collapse with no lever, by state cost g (g sets S* = tau R / (g E)):")
    for g in GRID["g"]:
        cs = [ci for ci in range(len(CELLS)) if CELLS[ci]["g"] == g]
        out.append(f"g {g:4.0f}: {sum(base[ci]['ncol'] > 0 for ci in cs):3d} of {len(cs)}")
    (HERE / "levers_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
