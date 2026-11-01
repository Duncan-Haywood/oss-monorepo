"""Milestone 54: BOHB proper (Falkner et al. 2018): Hyperband brackets whose entrants are chosen by a TPE/KDE density ratio fitted on the
highest rung with enough observations, against random-entrant Hyperband, f3 successive halving, and random routing. Same tables, cost model,
budgets and regret as milestone 23 (mf_tpe/tpe.py). Runs no flow. Writes results.txt and summary.json. Usage: python3 bohb.py"""
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
ETA = 3
GAMMA, BW_FLOOR, P_RANDOM, MIN_OBS = 0.25, 0.3, 1 / 3, 6
TABLES = {n: HERE.parent / n / "results.jsonl" for n in ("rung_bias", "large", "nonarith")}
RUNGS = ("r2", "r3", "r4")


def costs(tight):
    return {
        "r2": M(r["t2_yosys"] + r["t_pnr_to_synth_netlist"] for r in tight),
        "r3": M(r["t_pnr_to_detail_place"] - r["t_pnr_to_synth_netlist"] for r in tight),
        "r4": M(r["t_pnr_total"] - r["t_pnr_to_detail_place"] for r in tight),
        "full": M(r["t2_yosys"] + r["t_pnr_total"] for r in tight),
    }


def entry_cost(C, start):
    return {"r2": C["r2"], "r3": C["r2"] + C["r3"], "r4": C["full"]}[start]


def plan(C, n0, start):
    """(rung, survivors) list and total cost of one bracket."""
    rungs = RUNGS[RUNGS.index(start):]
    n, total, p = n0, 0.0, []
    for k, rg in enumerate(rungs):
        total += n * (entry_cost(C, start) if k == 0 else C[rg])
        p.append((rg, n))
        n = max(1, n // ETA)
    return total, p


def kde(pts, x, h):
    d = len(x)
    c = (2 * math.pi) ** (-d / 2) / h ** d
    return c * M(math.exp(-0.5 * sum((a - b) ** 2 for a, b in zip(x, p)) / h ** 2) for p in pts) + 1e-12


def choose(cands, n0, obs, z, rng, model):
    """Pick n0 entrants from cands: random, or by l/g on the highest rung holding at least MIN_OBS observations (a third stay random)."""
    pool = list(cands)
    rng.shuffle(pool)
    rung = next((rg for rg in reversed(RUNGS) if len(obs[rg]) >= MIN_OBS), None)
    if not model or rung is None:
        return pool[:n0]
    order = sorted(obs[rung], key=lambda t: t[1])
    ng = max(2, math.ceil(GAMMA * len(order)))
    good, bad = [z[i] for i, _ in order[:ng]], [z[i] for i, _ in order[ng:]]
    d = len(good[0])
    hg = max(BW_FLOOR, len(good) ** (-1 / (d + 4)))
    hb = max(BW_FLOOR, len(bad) ** (-1 / (d + 4)))
    ranked = sorted(pool, key=lambda i: -(kde(good, z[i], hg) / kde(bad, z[i], hb)))
    out, rest = [], list(ranked)
    while rest and len(out) < n0:
        j = rng.choice(rest) if rng.random() < P_RANDOM else rest[0]
        rest.remove(j)
        out.append(j)
    return out


def hyperband(C, sc, ref, z, B, starts, rng, model):
    """Brackets in `starts` order, B/len(starts) seconds each; each bracket's entrants exclude points already seen. None if nothing was routed."""
    obs = {rg: [] for rg in RUNGS}
    seen, best = set(), None
    for st in starts:
        Bb = B / len(starts)
        n0 = 0
        for n in range(1, len(sc) - len(seen) + 1):
            if plan(C, n, st)[0] <= Bb:
                n0 = n
            else:
                break
        if n0 == 0:
            continue
        cur = choose([i for i in range(len(sc)) if i not in seen], n0, obs, z, rng, model)
        seen.update(cur)
        _, p = plan(C, n0, st)
        for k, (rg, _) in enumerate(p):
            cur = sorted(cur, key=lambda i: (sc[i][rg], rng.random()))
            for i in cur:
                obs[rg].append((i, sc[i][rg]))
            if k + 1 < len(p):
                cur = cur[:p[k + 1][1]]
        vals = [ref[i] for i in cur]
        best = min(vals) if best is None else min(best, min(vals))
    return best


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
        mu = [M(f[j] for f in f2) for j in range(2)]
        sdv = [max(statistics.pstdev([f[j] for f in f2]), 1e-6) for j in range(2)]
        z = [tuple((f[j] - mu[j]) / sdv[j] for j in range(2)) for f in f2]
        cell = (tag, d)
        for B in BUDGETS:
            Bc = B * C["full"]
            for sd in range(SEEDS):
                key = lambda tail: random.Random(sd * 7919 + zlib.crc32(d.encode()) % 1000 + tail)
                ids = list(range(len(ref)))
                key(1).shuffle(ids)
                out = {
                    "rand": min(ref[i] for i in ids[:max(int(B), 1)]),
                    "sh_r2": hyperband(C, sc, ref, z, Bc, ("r2",), key(2), False),
                    "hb": hyperband(C, sc, ref, z, Bc, ("r2", "r3", "r4"), key(3), False),
                    "bohb": hyperband(C, sc, ref, z, Bc, ("r2", "r3", "r4"), key(3), True),
                    "bohb_r4first": hyperband(C, sc, ref, z, Bc, ("r4", "r3", "r2"), key(3), True),
                }
                for a, v in out.items():
                    reg.setdefault((cell, B, a), []).append(pct(v, lo))
for k, v in list(reg.items()):
    reg[k] = None if None in v else M(v)

cells = sorted({k[0] for k in reg})
arms = ["rand", "sh_r2", "hb", "bohb", "bohb_r4first"]
out = [f"# milestone 54: BOHB (KDE entrants inside Hyperband brackets), {len(cells)} cells, {SEEDS} paired seeds, eta {ETA}, min obs {MIN_OBS}, gamma {GAMMA}, bw floor {BW_FLOOR}, random frac {P_RANDOM:.2f}\n"]
summary = {}
out.append("## mean regret % over cells (n/a: some seed could not afford the arm)\nbudget (x routed cost) | " + " | ".join(arms))
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
out.append("\n## paired per-cell wins of bohb over hb and over rand (cells lower / higher mean regret), sign-test p two-sided")
for ref_arm in ("hb", "rand"):
    for B in BUDGETS:
        d = [reg[(c, B, "bohb")] - reg[(c, B, ref_arm)] for c in cells if reg[(c, B, "bohb")] is not None and reg[(c, B, ref_arm)] is not None]
        w, l = sum(x < -1e-9 for x in d), sum(x > 1e-9 for x in d)
        n = w + l
        p = min(1.0, 2 * sum(math.comb(n, k) for k in range(0, min(w, l) + 1)) / 2 ** n) if n else 1.0
        out.append(f"bohb vs {ref_arm}, B {B}: wins {w}, losses {l}, p {p:.3f}")
        summary[f"wins_{ref_arm}_B{B}"] = {"w": w, "l": l, "p": p}
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
