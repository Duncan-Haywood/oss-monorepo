"""Milestone 4 (H2 first look): cheapest contracts from audit alone, score alone and both, built on the
measured actions in actions.json. Writes results.json and results.txt.  Run: PYTHONPATH=../../src python3 analyse.py

Model (units: the honest worker's compute cost C = 1; T = 1,500 steps, so re-executing one step costs 1/T):
 * action a = skip every step whose honest update has norm <= tau'_a. Effort e_a = 1 - skipped_a, cost e_a.
 * audit: m steps drawn at random, each re-executed; a skipped step is caught iff its honest update norm
   exceeds the referee's tolerance tau, i.e. with probability q_a = max(0, skipped_a - skipped_tau) per
   audited step. P(caught) = 1 - (1 - q_a)^m. Honest workers are never caught (tau >= benign drift).
 * score: held-out loss on n_test examples ~ Normal(loss_mean_a, seed_sd_a^2 + var_example_a / n_test),
   discretised into 400 bins; a Gaussian score is an assumption, the means and variances are measured.
 * pay w(audit outcome, score bin) >= -stake; requester pays E[w] + m/T."""
import json
import os
import sys

import numpy as np
from scipy.stats import norm

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.contract import optimal_contract  # noqa: E402

T = 1500
ACT = json.load(open(os.path.join(HERE, "actions.json")))
ACTIONS = [a for a in ACT["actions"] if a["tau_prime"] < 1e8]  # last row duplicates tau' = 1.0
SKIP = np.array([a["skipped"] for a in ACTIONS])
COST = 1.0 - SKIP
MS = [0] + [int(round(x)) for x in np.geomspace(1, T, 24)]


def score_probs(n_test, edges):
    """P[a, bin]: score distribution of every action, shared bins."""
    rows = []
    for a in ACTIONS:
        sd = np.sqrt(a["loss_seed_sd"] ** 2 + a["var_example"] / n_test)
        cdf = norm.cdf(edges, a["loss_mean"], sd)
        rows.append(np.diff(np.concatenate([[0.0], cdf, [1.0]])))
    return np.array(rows)


def edges_for(n_test):
    h = ACTIONS[0]
    sd = np.sqrt(h["loss_seed_sd"] ** 2 + h["var_example"] / n_test)
    return h["loss_mean"] + sd * np.linspace(-6, 60, 400)


def caught(tau_idx, m):
    q = np.maximum(0.0, SKIP - SKIP[tau_idx]) if tau_idx is not None else np.zeros_like(SKIP)
    return 1 - (1 - q) ** m


def build(kind, tau_idx, m, n_test):
    """Signal matrix P (actions x signals) for a contract class."""
    pc = caught(tau_idx, m)
    audit = np.stack([1 - pc, pc], 1)
    if kind == "audit":
        return audit
    S = score_probs(n_test, edges_for(n_test))
    if kind == "score":
        return S
    return np.stack([audit[:, [i]] * S for i in (0, 1)], 1).reshape(len(ACTIONS), -1)  # joint (pass bins, caught bins)


def best(kind, tau_idx, stake, n_test, basis=None, target=0):
    """Cheapest total cost over audit sizes m for a contract class: (total, m, payment). Score-only has
    m = 0; the joint class may also fall back to m = 0 (it contains the score-only contract)."""
    out = (float("inf"), 0, float("inf"))
    if kind in ("score", "joint"):
        pay, _ = optimal_contract(build("score", None, 0, n_test), COST, target=target, stake=stake, basis=basis)
        out = (pay, 0, pay)
    if kind in ("audit", "joint"):
        for m in MS[1:]:
            pay, _ = optimal_contract(build(kind, tau_idx, m, n_test), COST, target=target, stake=stake)
            if pay + m / T < out[0]:
                out = (pay + m / T, m, pay)
    return out


def linear_basis(n_test):
    e = edges_for(n_test)
    mid = np.concatenate([[e[0]], (e[:-1] + e[1:]) / 2, [e[-1]]])
    return np.stack([np.ones_like(mid), mid], 1)


def main():
    res = {"T": T, "n_test": ACT["n_test"], "actions": ACTIONS, "frontier": [], "h2": []}
    lines = []
    taus = [(None, "no check"), (0, "0"), (1, "1e-4"), (2, "1e-3"), (4, "1e-2"), (5, "3e-2")]
    lines.append("== A. cost of securing honest effort (requester total / honest compute cost) vs referee tolerance")
    lines.append("stake S=1 (x C), n_test=540; audit = best m (shown), score = proper score on held-out set")
    lines.append("tau  audit_only(m)  score_only  score_linear  joint(m)  replication(m=T)  cheat_gain_undetected")
    for ti, name in taus[1:]:
        S, n = 1.0, ACT["n_test"]
        a = best("audit", ti, S, n)
        s = best("score", ti, S, n)
        lin = best("score", ti, S, n, basis=linear_basis(n))
        j = best("joint", ti, S, n)
        rep = optimal_contract(build("audit", ti, T, n), COST, stake=S)[0] + 1.0
        free = float(1 - COST[np.nonzero(caught(ti, 10 ** 6) < 1e-9)[0]].min()) if (caught(ti, 10 ** 6) < 1e-9).any() else 0.0
        row = {"tau": name, "audit": a[0], "audit_m": a[1], "score": s[0], "score_linear": lin[0], "joint": j[0], "joint_m": j[1],
               "replication": rep, "free_skip_share": free}
        res["frontier"].append(row)
        lines.append(f"{name:5} {a[0]:8.3f}({a[1]:4d}) {s[0]:10.3f} {lin[0]:12.3f} {j[0]:8.3f}({j[1]:4d}) {rep:14.3f} {free:12.3f}")
    lines.append("")
    lines.append("== B. H2: joint cost over the better single check, across stake, tolerance and test-set size")
    lines.append("S    tau   n_test  audit_only  score_only  joint   joint/min  m_joint")
    for S in (0.25, 1.0, 4.0):
        for ti, name in taus[1:]:
            for n in (100, 540, 5000):
                a = best("audit", ti, S, n)[0]
                s = best("score", ti, S, n)[0]
                j = best("joint", ti, S, n)
                r = j[0] / min(a, s)
                res["h2"].append({"stake": S, "tau": name, "n_test": n, "audit": a, "score": s, "joint": j[0], "ratio": r, "m": j[1]})
                lines.append(f"{S:<5} {name:5} {n:6} {a:10.3f} {s:10.3f} {j[0]:7.3f} {r:9.4f} {j[1]:6d}")
    lines.append("")
    lines.append("== C. quality-priced targets: implement the action that skips every step with update norm <= tau', with the referee")
    lines.append("tolerance set to the same tau' (so the target passes every audit). Cost = requester total / honest compute cost C.")
    lines.append("S=1. loss_deg = held-out loss given up; seed_sd = honest seed std. n_test=5000 (score noise 0.005) and 540 (0.015)")
    lines.append("tau'   effort  loss_deg  deg/seed_sd  n_test  audit_only(m)  score_only  joint(m)  joint/min")
    res["frontier_target"] = []
    base = ACTIONS[0]["loss_mean"]
    for k in range(1, 8):
        for n in (540, 5000):
            a = best("audit", k, 1.0, n, target=k)
            s_ = best("score", k, 1.0, n, target=k)
            j = best("joint", k, 1.0, n, target=k)
            deg = ACTIONS[k]["loss_mean"] - base
            row = {"tau_prime": ACTIONS[k]["tau_prime"], "effort": COST[k], "loss_deg": deg,
                   "deg_over_sd": deg / ACTIONS[0]["loss_seed_sd"], "n_test": n,
                   "audit": a[0], "audit_m": a[1], "score": s_[0], "joint": j[0], "joint_m": j[1],
                   "ratio": j[0] / min(a[0], s_[0])}
            res["frontier_target"].append(row)
            lines.append(f"{ACTIONS[k]['tau_prime']:<7g} {COST[k]:6.3f} {deg:9.4f} {deg / ACTIONS[0]['loss_seed_sd']:10.2f} {n:7d} "
                         f"{a[0]:9.3f}({a[1]:4d}) {s_[0]:10.3f} {j[0]:8.3f}({j[1]:4d}) {row['ratio']:8.4f}")
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
