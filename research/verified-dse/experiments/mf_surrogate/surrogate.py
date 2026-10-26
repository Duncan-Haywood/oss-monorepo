"""Milestone 20: a two-feature multi-fidelity regression surrogate against f3, eta = 1.5 and random (same tables, cost model, seeds and regret as
milestones 16 and 17). Runs no flow. Writes results.txt and summary.json. Usage: python3 surrogate.py"""
import json
import math
import random
import statistics
import sys
import zlib
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

M = statistics.mean
SEEDS = 400
BUDGETS = (15, 25, 40)
M_PILOT, SCREEN_SHARE, RIDGE = 5, 0.4, 1.0
TABLES = {n: HERE.parent / n / "results.jsonl" for n in ("rung_bias", "large", "nonarith")}


def costs(tight):
    return {
        "r2": M(r["t2_yosys"] + r["t_pnr_to_synth_netlist"] for r in tight),
        "r3": M(r["t_pnr_to_detail_place"] - r["t_pnr_to_synth_netlist"] for r in tight),
        "r4": M(r["t_pnr_total"] - r["t_pnr_to_detail_place"] for r in tight),
        "full": M(r["t2_yosys"] + r["t_pnr_total"] for r in tight),
    }


def shrink(n, eta):
    return max(1, int(n / eta + 1e-9))


def cuts(eta):
    return (1, int(eta[1:])) if isinstance(eta, str) else (eta, eta)


def sh_cost(C, n0, eta):
    n, total = n0, 0.0
    for k, rg in enumerate(("r2", "r3", "r4")):
        total += n * C[rg]
        n = shrink(n, cuts(eta)[min(k, 1)])
    return total


def run_sh(C, sc, ref, ids, B, eta, rng):
    n0 = 0
    for n in range(1, len(ids) + 1):
        if sh_cost(C, n, eta) <= B:
            n0 = n
        else:
            break
    if n0 == 0:
        return None
    cur = rng.sample(ids, n0)
    keep = n0
    for k, rg in enumerate(("r2", "r3", "r4")):
        cur = sorted(cur, key=lambda i: (sc[i][rg], rng.random()))
        keep = shrink(keep, cuts(eta)[min(k, 1)])
        if k < 2:
            cur = cur[:keep]
    return min(ref[i] for i in cur)


def ridge_fit(X, y, lam):
    """Ridge regression with an unpenalised intercept; features centred. Solves the normal equations by Gaussian elimination."""
    n, d = len(X), len(X[0])
    mu = [M(x[j] for x in X) for j in range(d)]
    ym = M(y)
    A = [[sum((x[i] - mu[i]) * (x[j] - mu[j]) for x in X) + (lam if i == j else 0.0) for j in range(d)] for i in range(d)]
    b = [sum((x[i] - mu[i]) * (t - ym) for x, t in zip(X, y)) for i in range(d)]
    for c in range(d):
        p = max(range(c, d), key=lambda r: abs(A[r][c]))
        A[c], A[p], b[c], b[p] = A[p], A[c], b[p], b[c]
        for r in range(c + 1, d):
            f = A[r][c] / A[c][c]
            for k in range(c, d):
                A[r][k] -= f * A[c][k]
            b[r] -= f * b[c]
    w = [0.0] * d
    for c in reversed(range(d)):
        w[c] = (b[c] - sum(A[c][k] * w[k] for k in range(c + 1, d))) / A[c][c]
    return lambda x: ym + sum(wj * (xj - mj) for wj, xj, mj in zip(w, x, mu))


def run_mf(C, feats, ref, ids, B, rng):
    """Screen at R2, route M_PILOT through R3+R4, then route the lowest-prediction point, refitting each time."""
    n0 = min(len(ids), int(SCREEN_SHARE * B / C["r2"]))
    if n0 <= M_PILOT:
        return None
    cand = rng.sample(ids, n0)
    left = B - n0 * C["r2"]
    rest = C["r3"] + C["r4"]
    routed = cand[:M_PILOT]
    left -= M_PILOT * rest
    if left < 0:
        return None
    todo = cand[M_PILOT:]
    while True:
        f = ridge_fit([feats[i] for i in routed], [math.log(ref[i]) for i in routed], RIDGE)
        if left < rest or not todo:
            break
        j = min(todo, key=lambda i: (f(feats[i]), rng.random()))
        todo.remove(j)
        routed.append(j)
        left -= rest
    return min(ref[i] for i in routed)


def pct(v, lo):
    return None if v is None else (v / lo - 1) * 100


reg = {}
for name, path in TABLES.items():
    rows = [json.loads(l) for l in path.read_text().splitlines()]
    ok = [r for r in rows if r["status"] == "ok"]
    C = costs([r for r in ok if r["tag"] == "tight"])
    by = defaultdict(list)
    for r in ok:
        by[(r["tag"], r["design"])].append(r)
    for (tag, d), pool in sorted(by.items()):
        sc = [flow.scores(r) for r in pool]
        ref = [s["r4"] for s in sc]
        lo = min(ref)
        f2 = [(math.log(r["synth_netlist_area"]), math.log(r["period_ns"] - r["synth_netlist_wns"])) for r in pool]
        f1 = [(math.log(s["r2"]),) for s in sc]
        cell = (tag, d)
        for B in BUDGETS:
            Bc = B * C["full"]
            for sd in range(SEEDS):
                key = lambda tail: random.Random(sd * 7919 + zlib.crc32(d.encode()) % 1000 + tail)
                ids = list(range(len(ref)))
                rr = key(1)
                rr.shuffle(ids)
                out = {
                    "rand": min(ref[i] for i in ids[:max(int(B), 1)]),
                    "fixed1.5": run_sh(C, sc, ref, ids, Bc, 1.5, key(2)),
                    "fixedf3": run_sh(C, sc, ref, ids, Bc, "f3", key(2)),
                    "mf1": run_mf(C, f1, ref, ids, Bc, key(5)),
                    "mf2": run_mf(C, f2, ref, ids, Bc, key(5)),
                }
                for a, v in out.items():
                    reg.setdefault((cell, B, a), []).append(pct(v, lo))
for k, v in list(reg.items()):
    reg[k] = None if None in v else M(v)

cells = sorted({k[0] for k in reg})
arms = ["rand", "fixed1.5", "fixedf3", "mf1", "mf2"]
out = [f"# milestone 20: multi-fidelity regression surrogate, {len(cells)} cells, {SEEDS} paired seeds, m={M_PILOT}, screen share {SCREEN_SHARE}, ridge {RIDGE}\n"]
summary = {}
out.append("## mean regret % over cells (n/a: some seed could not afford the arm)\nbudget | " + " | ".join(arms))
for B in BUDGETS:
    row = []
    for a in arms:
        v = [reg[(c, B, a)] for c in cells]
        row.append("n/a" if None in v else f"{M(v):.2f}")
    out.append(f"{B} | " + " | ".join(row))
    summary[f"mean_B{B}"] = dict(zip(arms, row))
out.append("\n## worst-cell mean regret % (cell)")
for B in BUDGETS:
    row = []
    for a in arms:
        v = [(reg[(c, B, a)], c) for c in cells if reg[(c, B, a)] is not None]
        w = max(v) if len(v) == len(cells) else None
        row.append("n/a" if w is None else f"{w[0]:.1f} ({w[1][1]} {w[1][0]})")
    out.append(f"{B} | " + " | ".join(row))
out.append("\n## barrel64 (mean over its two clocks)")
for B in BUDGETS:
    out.append(f"{B} | " + " | ".join("n/a" if None in [reg[(c, B, a)] for c in cells if c[1] == "barrel64"] else f"{M(reg[(c, B, a)] for c in cells if c[1] == 'barrel64'):.2f}" for a in arms))
out.append("\n## paired per-cell wins of mf2 over f3 (cells where mf2 mean regret is lower / higher), and sign-test p (two-sided, ties dropped)")
for B in BUDGETS:
    d = [reg[(c, B, "mf2")] - reg[(c, B, "fixedf3")] for c in cells if reg[(c, B, "mf2")] is not None]
    w, l = sum(x < -1e-9 for x in d), sum(x > 1e-9 for x in d)
    n = w + l
    p = min(1.0, 2 * sum(math.comb(n, k) for k in range(0, min(w, l) + 1)) / 2 ** n) if n else 1.0
    out.append(f"{B}: wins {w}, losses {l}, p {p:.3f}")
    summary[f"wins_B{B}"] = {"w": w, "l": l, "p": p}
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
