"""Milestone 9: the milestone-3 replay (random R4, SH from R1 and R2, calibrated SH) on the five larger designs,
same code and seeds, budgets scaled to the larger routed cost. Runs no flow.
Writes results.txt and summary.json. Usage: python3 replay.py"""
import json
import random
import statistics
import sys
import zlib
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

BUDGETS = (100, 200, 400, 600, 900, 1200)
DESIGNS = ["mult16", "mult24", "mult32", "adder_op64", "adder_ripple64"]
SEEDS = 400
ETA = 3
PILOT = 6
RHO_MIN = 0.5
rows = [json.loads(l) for l in (HERE / "results.jsonl").read_text().splitlines()]
tight = [r for r in rows if r["status"] == "ok" and r["tag"] == "tight"]
M = statistics.mean
COST = {  # seconds to evaluate one point at a rung, given it was just evaluated at the previous one
    "r1": M(r["t1"] for r in tight),
    "r2": M(r["t2_yosys"] + r["t_pnr_to_synth_netlist"] for r in tight),
    "r3": M(r["t_pnr_to_detail_place"] - r["t_pnr_to_synth_netlist"] for r in tight),
    "r4": M(r["t_pnr_total"] - r["t_pnr_to_detail_place"] for r in tight),
}
C4_FULL = M(r["t2_yosys"] + r["t_pnr_total"] for r in tight)  # a routed point from nothing
by = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        by[(r["tag"], r["design"])].append(r)


def spearman(x, y):
    def rk(v):
        o = sorted(range(len(v)), key=lambda i: v[i])
        out = [0.0] * len(v)
        i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
                j += 1
            for k in range(i, j + 1):
                out[o[k]] = (i + j) / 2
            i = j + 1
        return out
    a, b = rk(x), rk(y)
    ma, mb = M(a), M(b)
    num = sum((p - ma) * (q - mb) for p, q in zip(a, b))
    den = (sum((p - ma) ** 2 for p in a) * sum((q - mb) ** 2 for q in b)) ** 0.5
    return num / den if den else 0.0


def sh_cost(n0, start):
    """Total cost of SH from rung `start` with n0 entrants; also returns survivor counts per rung."""
    rungs = ["r1", "r2", "r3", "r4"][["r1", "r2", "r3", "r4"].index(start):]
    n, total, plan = n0, 0.0, []
    for k, rg in enumerate(rungs):
        # the first rung a point meets pays the full price from scratch (r1 is its own flow, r2/r4 start at yosys)
        c = COST[rg] if k else {"r1": COST["r1"], "r2": COST["r2"], "r3": COST["r2"] + COST["r3"], "r4": C4_FULL}[rg]
        total += n * c
        plan.append((rg, n))
        n = max(1, n // ETA)
    return total, plan


def run_sh(pool, sc, ref, B, start, rng, spent=0.0):
    """Largest n0 that fits in B - spent; returns best routed value found, or None if none fits."""
    left = B - spent
    n0 = 0
    for n in range(1, len(pool) + 1):
        if sh_cost(n, start)[0] <= left:
            n0 = n
        else:
            break
    if n0 == 0:
        return None
    ids = rng.sample(range(len(pool)), n0)
    _, plan = sh_cost(n0, start)
    keep = [n for _, n in plan]
    cur = ids
    for k, rg in enumerate(["r1", "r2", "r3", "r4"][["r1", "r2", "r3", "r4"].index(start):]):
        cur = sorted(cur, key=lambda i: (sc[i][rg], rng.random()))
        if k + 1 < len(keep):
            cur = cur[:keep[k + 1]]
    return min(ref[i] for i in cur)


def random_r4(pool, ref, B, rng):
    n = max(int(B // C4_FULL), 1)
    ids = list(range(len(pool)))
    rng.shuffle(ids)
    return min(ref[i] for i in ids[:n])


def calibrated(pool, sc, ref, B, rng):
    ids = list(range(len(pool)))
    rng.shuffle(ids)
    pil = ids[:PILOT]
    spent = PILOT * C4_FULL
    if spent > B:
        return min(ref[i] for i in pil[:max(int(B // C4_FULL), 1)])
    best_pilot = min(ref[i] for i in pil)
    start = "r4"
    for rg in ("r1", "r2", "r3"):
        if spearman([sc[i][rg] for i in pil], [ref[i] for i in pil]) >= RHO_MIN:
            start = rg
            break
    rest = [i for i in ids[PILOT:]]
    sub = [pool[i] for i in rest]
    subsc = [sc[i] for i in rest]
    subref = [ref[i] for i in rest]
    v = run_sh(sub, subsc, subref, B, start, rng, spent) if sub else None
    return best_pilot if v is None else min(best_pilot, v)


STRATS = ["random_r4", "sh_r1", "sh_r2", "sh_cal"]


def mean_ci(x, rng):
    m = M(x)
    bs = sorted(M(rng.choices(x, k=len(x))) for _ in range(500))
    return m, bs[12], bs[487]


out = [f"cost model (mean s): r1 {COST['r1']:.3f}; r2 from scratch {COST['r2']:.3f}; r3 increment {COST['r3']:.3f}; r4 increment {COST['r4']:.3f}; routed from scratch {C4_FULL:.3f}. eta {ETA}, pilot {PILOT}, rho_min {RHO_MIN}, seeds {SEEDS}. regret = routed best found / pool minimum - 1, %\n"]
summary = {}
for tag in ("tight", "relaxed"):
    out.append(f"## clock {tag}: mean regret % over designs | designs where the strategy beats / loses to random_r4 (paired 95% CI excludes 0) | worst-design mean regret %")
    out.append("budget s | " + " | ".join(STRATS))
    for B in BUDGETS:
        cell = {s: [] for s in STRATS}
        wl = {s: [0, 0] for s in STRATS}
        for d in DESIGNS:
            pool = by[(tag, d)]
            sc = [flow.scores(r) for r in pool]
            ref = [x["r4"] for x in sc]
            lo = min(ref)
            reg = {s: [] for s in STRATS}
            for seed in range(SEEDS):
                for s in STRATS:
                    rng = random.Random(seed * 7919 + zlib.crc32(d.encode()) % 1000)
                    if s == "random_r4":
                        v = random_r4(pool, ref, B, rng)
                    elif s == "sh_r1":
                        v = run_sh(pool, sc, ref, B, "r1", rng)
                    elif s == "sh_r2":
                        v = run_sh(pool, sc, ref, B, "r2", rng)
                    else:
                        v = calibrated(pool, sc, ref, B, rng)
                    reg[s].append(None if v is None else (v / lo - 1) * 100)
            for s in STRATS:
                if reg[s][0] is None:
                    continue
                cell[s].append(M(reg[s]))
                if s != "random_r4":
                    diff = [a - b for a, b in zip(reg[s], reg["random_r4"])]
                    _, l, h = mean_ci(diff, random.Random(1))
                    if h < 0:
                        wl[s][0] += 1
                    elif l > 0:
                        wl[s][1] += 1
            summary[f"{tag}:{B}:{d}"] = {s: (M(reg[s]) if reg[s][0] is not None else None) for s in STRATS}
        parts = []
        for s in STRATS:
            if len(cell[s]) < len(DESIGNS):
                parts.append("n/a")
            elif s == "random_r4":
                parts.append(f"{M(cell[s]):.2f} (worst {max(cell[s]):.1f})")
            else:
                parts.append(f"{M(cell[s]):.2f} ({wl[s][0]}/{wl[s][1]}; worst {max(cell[s]):.1f})")
        out.append(f"{B} | " + " | ".join(parts))
    out.append("")
(HERE / "halving_results.txt").write_text("\n".join(out) + "\n")
(HERE / "halving_summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
