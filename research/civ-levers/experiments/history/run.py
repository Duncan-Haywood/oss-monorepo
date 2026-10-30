"""Sweep the unmeasured parameters of the toy structural-demographic model; write results.txt.

    PYTHONPATH=src python3 experiments/history/run.py      # about 1 minute
Does the model produce secular cycles (period 150-400 years, Turchin and Nefedov 2009)
anywhere in its parameter space, and which levers damp them where it does?
"""
import itertools
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from civ_levers.history import run, summary  # noqa: E402

GRID = dict(rho=(0.01, 0.03, 0.06, 0.12), m=(0.02, 0.05, 0.1), me=(0.04, 0.1),
            k=(4, 8, 16), tau=(0.2, 0.4), g=(0.5, 1.0, 2.0), e0f=(0.05, 0.2))
LEVERS = {"none": {}, "tax x2": {"tau_mult": 1.25}, "elite cap": {"cap": 1.0}, "welfare 0.1": {"welfare": 0.1}}


def cell(kw, lever):
    kw = dict(kw)
    if "tau_mult" in lever:
        kw["tau"] = min(0.9, kw["tau"] * 2)
    if "cap" in lever:
        kw["elite_cap"] = kw["e0f"] * 1.2
    if "welfare" in lever:
        kw["welfare"] = lever["welfare"]
    return summary(*run(years=2500, **kw))


def main():
    keys = list(GRID)
    cells = [dict(zip(keys, v)) for v in itertools.product(*GRID.values())]
    out = ["civ-history results (written by experiments/history/run.py; do not edit by hand)",
           f"{len(cells)} parameter cells; 2500 years from N0 = 0.5, first 500 dropped; "
           "cycle = autocorrelation peak > 0.2 in N; secular-cycle band 150-400 years",
           "grid: " + str(GRID), ""]
    rows = {}
    for name, lev in LEVERS.items():
        rows[name] = [cell(c, lev) for c in cells]
    for name, rs in rows.items():
        cyc = sum(1 for r in rs if r["period"])
        band = sum(1 for r in rs if 150 <= r["period"] <= 400)
        unrest = sum(r["unrest_share"] for r in rs) / len(rs)
        nmin = sum(r["n_min"] for r in rs) / len(rs)
        out.append(f"{name:12s} cycles {cyc}/{len(rs)}  in-band {band}  mean unrest-share {unrest:.3f}  mean min N {nmin:.3f}")
    base = rows["none"]
    perm = sum(1 for r in base if r["unrest_share"] > 0.9)
    out.append(f"largest population swing (std/mean) over all cells with no lever: {max(r['n_cv'] for r in base):.4f}")
    out.append(f"cells stuck in permanent unrest (psi > 0.5 in over 90% of years), no lever: {perm}")
    out.append("")
    out.append("cells with a cycle under no lever, and the effect of each lever on them (unrest share):")
    for i, (c, r) in enumerate(zip(cells, base)):
        if r["period"]:
            out.append(f"{c} period {r['period']} unrest {r['unrest_share']:.2f} -> " +
                       ", ".join(f"{n}: {rows[n][i]['unrest_share']:.2f}/{rows[n][i]['period']}" for n in list(LEVERS)[1:]))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
