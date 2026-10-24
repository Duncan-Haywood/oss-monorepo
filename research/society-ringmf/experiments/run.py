"""Compare the local mean-field with the society-allies simulation and write experiments/results.txt.

    PYTHONPATH=src:../society-allies/src python3 experiments/run.py

Deterministic (seeded), standard library only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "society-allies" / "src"))
from society_ringmf import fixed_point  # noqa: E402
from society_allies import simulate  # noqa: E402

N, ROUNDS, SEEDS, EPS, M = 200, 500, 10, 0.02, 9
RHOS = [round(0.04 * i, 2) for i in range(1, 11)]
BLOCKS, KS = (1, 2, 4, 8), (1, 2, 3, 5)
out = []


def say(s=""):
    print(s, flush=True)
    out.append(s)


def sim_tip(rho, b, k):
    rs = [simulate(n=N, rho=rho, block=b, k=k, m=M, eps=EPS, rounds=ROUNDS, seed=s)["final_share_l"] for s in range(SEEDS)]
    return sum(r >= 0.9 for r in rs) / SEEDS, sum(rs) / SEEDS


def first_cross(vals, thr):
    for rho, v in zip(RHOS, vals):
        if v >= thr:
            return rho
    return None


say(f"society-ringmf results. N={N}, memory M={M}, eps={EPS}; simulation {ROUNDS} rounds, {SEEDS} seeds per cell, as society-allies.")
say("Mean-field = deterministic fixed point from everyone on R. 'tip' = at least 90% of people on L (sim: fraction of crowds; MF: 1 or 0).")
say()
say("== A. Smallest robot share rho (grid 0.04 steps) at which the crowd tips: mean-field vs simulation (50% of crowds)")
say("block  k   MF_rho*  sim_rho*")
rows = []
for k in KS:
    for b in BLOCKS:
        mf = [fixed_point(n=N, rho=r, block=b, k=k, m=M, eps=EPS)[0] for r in RHOS]
        sm = [sim_tip(r, b, k) for r in RHOS]
        rows.append((b, k, mf, sm))
        f = lambda v: "none" if v is None else f"{v:.2f}"
        say(f"{b:>5} {k:>2}   {f(first_cross(mf, 0.9)):>6}   {f(first_cross([s[0] for s in sm], 0.5)):>6}")
say()
say("== B. Detail, k = 2: MF final share on L / simulated mean share on L / simulated fraction of crowds tipping")
say("block  " + "  ".join(f"rho={r:.2f}" + " " * 14 for r in RHOS[:6]))
for b, k, mf, sm in rows:
    if k == 2:
        say(f"{b:>5}  " + "  ".join(f"{m:.2f}/{s[1]:.2f}/{s[0]:.2f}" for m, s in list(zip(mf, sm))[:6]))
say()
say("== C. Does MF tip/no-tip agree with the simulated majority outcome, over all cells?")
agree = tot = mf_only = sim_only = 0
for b, k, mf, sm in rows:
    for m, s in zip(mf, sm):
        a, c = m >= 0.9, s[0] >= 0.5
        tot += 1
        agree += a == c
        mf_only += a and not c
        sim_only += c and not a
say(f"cells {tot}, agree {agree}, MF tips but sim does not {mf_only}, sim tips but MF does not {sim_only}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
