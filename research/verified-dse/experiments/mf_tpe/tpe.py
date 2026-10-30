"""Milestone 23: BOHB's model (TPE density ratio, Gaussian KDE) over R2 features, against f3 and random (same tables, cost model, seeds and regret as
milestones 16 to 21). Runs no flow. Writes results.txt and summary.json. Usage: python3 tpe.py"""
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
SEEDS = 100
BUDGETS = (15, 25, 40)
M_PILOT, SCREEN_SHARE = 5, 0.4
GAMMA, BW_FLOOR, P_RANDOM = 0.25, 0.3, 1 / 3
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



def kde(pts, x, h):
    """Product-Gaussian kernel density at x."""
    d = len(x)
    c = (2 * math.pi) ** (-d / 2) / h ** d
    return c * M(math.exp(-0.5 * sum((a - b) ** 2 for a, b in zip(x, p)) / h ** 2) for p in pts) + 1e-12


def run_tpe(C, feats, ref, ids, B, rng, random_frac):
    """Screen at R2, route M_PILOT random candidates through R3+R4, then route the candidate maximising l(x)/g(x) until the budget is spent."""
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
    d = len(feats[0])
    mu_f = [M(feats[i][j] for i in cand) for j in range(d)]
    sd_f = [max(statistics.pstdev([feats[i][j] for i in cand]), 1e-6) for j in range(d)]
    z = {i: tuple((feats[i][j] - mu_f[j]) / sd_f[j] for j in range(d)) for i in cand}
    while left >= rest and todo:
        if random_frac and rng.random() < random_frac:
            j = rng.choice(todo)
        else:
            order = sorted(routed, key=lambda i: ref[i])
            ng = max(2, math.ceil(GAMMA * len(order)))
            good, bad = [z[i] for i in order[:ng]], [z[i] for i in order[ng:]]
            if not bad:
                j = rng.choice(todo)
            else:
                hg = max(BW_FLOOR, len(good) ** (-1 / (d + 4)))
                hb = max(BW_FLOOR, len(bad) ** (-1 / (d + 4)))
                j = max(todo, key=lambda i: (kde(good, z[i], hg) / kde(bad, z[i], hb), rng.random()))
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
                    "tpe1": run_tpe(C, f1, ref, ids, Bc, key(5), 0),
                    "tpe2": run_tpe(C, f2, ref, ids, Bc, key(5), 0),
                    "tpe2r": run_tpe(C, f2, ref, ids, Bc, key(5), P_RANDOM),
                }
                for a, v in out.items():
                    reg.setdefault((cell, B, a), []).append(pct(v, lo))
for k, v in list(reg.items()):
    reg[k] = None if None in v else M(v)

cells = sorted({k[0] for k in reg})
arms = ["rand", "fixed1.5", "fixedf3", "tpe1", "tpe2", "tpe2r"]
out = [f"# milestone 23: TPE (BOHB model), {len(cells)} cells, {SEEDS} paired seeds, m={M_PILOT}, screen share {SCREEN_SHARE}, gamma {GAMMA}, bw floor {BW_FLOOR}, random frac {P_RANDOM:.2f}\n"]
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
out.append("\n## paired per-cell wins of tpe1 over f3 (cells where tpe1 mean regret is lower / higher), and sign-test p (two-sided, ties dropped)")
for B in BUDGETS:
    d = [reg[(c, B, "tpe1")] - reg[(c, B, "fixedf3")] for c in cells if reg[(c, B, "tpe1")] is not None]
    w, l = sum(x < -1e-9 for x in d), sum(x > 1e-9 for x in d)
    n = w + l
    p = min(1.0, 2 * sum(math.comb(n, k) for k in range(0, min(w, l) + 1)) / 2 ** n) if n else 1.0
    out.append(f"{B}: wins {w}, losses {l}, p {p:.3f}")
    summary[f"wins_B{B}"] = {"w": w, "l": l, "p": p}
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
