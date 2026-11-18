"""The population term cancels out of political stress (milestone 7, sixth run; plan in LOG.md 2026-11-13).

Exact split: log PSI = 2 log(E/E*) + (1 - 2a) log N + log(S_ss/S) + offset, S_ss = tau R / (g E).
1. H1 identity over every neutral cell.
2. H2 neutral grid (offset 0), psi_reset 0: before collapse, is the fiscal lag larger than the elite term?
3. H3 no fiscal crash at collapse (collapse_fiscal 1): how many neutral cells still collapse?
4. H4 land share a 0.4 to 0.7, g chosen so the offset stays 0: sign of the population term before collapse.
Writes split_results.txt.

    PYTHONPATH=src python3 experiments/history/run_split.py
"""
import itertools, sys
from multiprocessing import Pool
from pathlib import Path
import numpy as np
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from civ_levers.history import run, stress_terms, log_psi  # noqa: E402

BURN, ESTAR, TAU = 500, 0.05, 0.3
NAMES = ("elite 2log(E/E*)", "population (1-2a)logN", "fiscal lag log(Sss/S)")
GRIDN = dict(rho=(0.03, 0.06, 0.12), m=(0.02, 0.05), k=(4, 8), lag=(0, 50, 100, 200),
             collapse_thr=(0.1, 0.3, 0.5), me=(0.02, 0.04, 0.08))
CELLS = [dict(zip(GRIDN, v)) for v in itertools.product(*GRIDN.values())]


def neutral_g(a):
    return TAU * (1 - a) / ESTAR      # offset log(g E* / (tau (1 - a))) = 0


def one(job):
    c, a, reset, fiscal = job
    g = neutral_g(a)
    kw = dict(years=2500, e0f=ESTAR, tau=TAU, g=g, plag=c["lag"], psi_reset=reset, a=a,
              collapse_fiscal=fiscal)
    kw.update(c)
    t, N, E, S, psi = run(**kw)
    T = stress_terms(N, E, S, tau=TAU, g=g, e0f=ESTAR, a=a)
    err = float(np.max(np.abs(T.sum(axis=1) - log_psi(N, E, S, e0f=ESTAR, a=a))))
    cols = [x for x in run.collapses if x >= BURN]
    w = [T[int(x) - 25:int(x), :3].mean(axis=0) for x in cols]
    return {"ncol": len(cols), "err": err, "w25": np.mean(w, axis=0) if w else None,
            "nmean": float(N[BURN:].mean())}


def block(res, label, a):
    col = [r for r in res if r["ncol"]]
    out = [f"{label}: collapsing {len(col)} of {len(res)}"]
    if not col:
        return out, col
    W = np.array([r["w25"] for r in col])
    out.append("  [w25] mean terms: " + "  ".join(f"{n} {v:+.3f}" for n, v in zip(NAMES, W.mean(axis=0))))
    live = [0, 2] if a == 0.5 else [0, 1, 2]      # at a = 0.5 the population term is identically 0
    j = np.array(live)[W[:, live].argmax(axis=1)]
    out.append("  [w25] largest of the non-zero terms: " + ", ".join(f"{n} {int((j == i).sum())} ({(j == i).mean():.2f})" for i, n in enumerate(NAMES)))
    out.append(f"  fiscal lag > elite in {int((W[:, 2] > W[:, 0]).sum())} of {len(W)} ({(W[:, 2] > W[:, 0]).mean():.2f}); "
               f"population term > 0 in {int((W[:, 1] > 0).sum())} ({(W[:, 1] > 0).mean():.2f}); "
               f"elite term > 0 in {int((W[:, 0] > 0).sum())} ({(W[:, 0] > 0).mean():.2f})")
    out.append(f"  mean collapses per collapsing cell {np.mean([r['ncol'] for r in col]):.1f}; "
               f"mean population (post-burn, all cells) {np.mean([r['nmean'] for r in res]):.3f}")
    by = []
    for lag in GRIDN["lag"]:
        by.append(f"lag {lag} {sum(r['ncol'] > 0 for c, r in zip(CELLS, res) if c['lag'] == lag)}")
    out.append("  by lag: " + ", ".join(by))
    by = []
    for thr in GRIDN["collapse_thr"]:
        sub = [r for c, r in zip(CELLS, res) if c["collapse_thr"] == thr and r["ncol"]]
        pos = sum(r["w25"][0] > 0 for r in sub)
        by.append(f"thr {thr}: {len(sub)} collapsing, elite term > 0 in {pos}, mean log PSI before collapse "
                  f"{np.mean([r['w25'].sum() for r in sub]) if sub else float('nan'):+.3f}")
    out.append("  by threshold: " + "; ".join(by))
    return out, col


def main():
    variants = [(0.5, 0.0, 0.1), (0.5, 1.0, 0.1), (0.5, 0.0, 1.0), (0.5, 1.0, 1.0)]
    variants += [(a, 0.0, 0.1) for a in (0.4, 0.6, 0.7)] + [(a, 0.0, 1.0) for a in (0.4, 0.6, 0.7)]
    jobs = [(c, *v) for v in variants for c in CELLS]
    with Pool() as pool:
        res = pool.map(one, jobs, chunksize=8)
    R = {v: res[i * len(CELLS):(i + 1) * len(CELLS)] for i, v in enumerate(variants)}
    out = ["civ-history: the population term cancels out of political stress (run_split.py; do not edit by hand)",
           f"2500 years, first {BURN} dropped; deterministic, one run per cell; tau {TAU}, E* {ESTAR}; "
           "g = tau (1 - a) / E* so the constant offset is 0 (neutral state)",
           f"grid {GRIDN} ({len(CELLS)} cells)", "",
           f"H1 identity: max |sum of split terms - log PSI| over {len(res)} runs = {max(r['err'] for r in res):.2e}", ""]
    for v in variants:
        a, reset, fiscal = v
        lines, _ = block(R[v], f"a {a}, g {neutral_g(a):.2f}, psi_reset {reset}, collapse_fiscal {fiscal}", a)
        out += lines
    out.append("")
    base, nocrash = R[(0.5, 0.0, 0.1)], R[(0.5, 0.0, 1.0)]
    cb = [i for i, r in enumerate(base) if r["ncol"]]
    out.append(f"H3 paired (a 0.5, psi_reset 0): of {len(cb)} cells collapsing with the fiscal crash, "
               f"{sum(nocrash[i]['ncol'] == 0 for i in cb)} stop without it, "
               f"{sum(nocrash[i]['ncol'] < base[i]['ncol'] for i in cb)} have fewer collapses; "
               f"{sum(nocrash[i]['ncol'] > 0 for i in range(len(CELLS)) if not base[i]['ncol'])} quiet cells start")
    (HERE / "split_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
