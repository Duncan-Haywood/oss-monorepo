"""Replay search strategies on the cached rung_bias table at equal wall-clock budget.
Runs no flow. Writes results.txt and summary.json. Usage: python3 replay.py"""
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

BUDGETS = (5, 10, 20, 30, 45)
SEEDS = 400
rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
ok = [r for r in rows if r["status"] == "ok"]
tight = [r for r in ok if r["tag"] == "tight"]
C1 = statistics.mean(r["t1"] for r in tight)
C2 = statistics.mean(r["t2_yosys"] + r["t_pnr_to_synth_netlist"] for r in tight)
C4 = statistics.mean(r["t2_yosys"] + r["t_pnr_total"] for r in tight)
by = defaultdict(list)
for r in ok:
    by[(r["tag"], r["design"])].append(r)


def lev1(a, b):
    """True if sequences a and b differ by one insertion, deletion or substitution."""
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    s, l = (a, b) if len(a) < len(b) else (b, a)
    return any(l[:i] + l[i + 1:] == s for i in range(len(l)))


def best_after(order, ref, n):
    return min(ref[i] for i in order[:n])


def random_search(pts, ref, B, rng):
    n = int(B // C4)
    order = list(range(len(pts)))
    rng.shuffle(order)
    return best_after(order, ref, max(n, 1)), n


def hill_climb(pts, ref, B, rng):
    n = max(int(B // C4), 1)
    seen, best_i = set(), None
    nb = {i: [j for j in range(len(pts)) if j != i and lev1(pts[i]["seq"], pts[j]["seq"])] for i in range(len(pts))}
    best = float("inf")
    cur = None
    while len(seen) < min(n, len(pts)):
        if cur is None:
            rest = [i for i in range(len(pts)) if i not in seen]
            cur = rng.choice(rest)
            seen.add(cur)
            if ref[cur] < best:
                best = ref[cur]
            cur_v = ref[cur]
        cand = [j for j in nb[cur] if j not in seen]
        if not cand:
            cur = None
            continue
        improved = False
        rng.shuffle(cand)
        for j in cand:
            if len(seen) >= n:
                break
            seen.add(j)
            best = min(best, ref[j])
            if ref[j] < cur_v:
                cur, cur_v, improved = j, ref[j], True
                break
        if not improved:
            cur = None
    return best, n


def screen(pts, ref, cheap, c, B, rng):
    """Score every point at the cheap rung, verify the best-ranked on R4 with the rest of the budget."""
    left = B - len(pts) * c
    if left < C4:
        return None, 0
    n = int(left // C4)
    order = sorted(range(len(pts)), key=lambda i: (cheap[i], rng.random()))
    return best_after(order, ref, n), n


def mean_ci(x, rng):
    m = statistics.mean(x)
    bs = sorted(statistics.mean(rng.choices(x, k=len(x))) for _ in range(500))
    return m, bs[12], bs[487]


out, summary = [], {}
out.append(f"cost model (mean s per point, tight runs): R1 {C1:.3f} | R2 cumulative {C2:.3f} | R4 cumulative {C4:.3f}; seeds {SEEDS}; regret = R4 best found / pool minimum - 1, in %\n")
strategies = ["random_r4", "hillclimb_r4", "screen_r1", "screen_r2"]
for tag in ("tight", "relaxed"):
    out.append(f"## clock {tag}: mean regret % over designs (each design's mean over seeds); screen_* = n/a when the budget cannot pay for screening the pool")
    out.append("budget s | " + " | ".join(strategies) + " | designs where screen_r2 beats / loses to random (paired 95% CI excludes 0) | same for screen_r1")
    for B in BUDGETS:
        per = {s: [] for s in strategies}
        win = {"screen_r2": 0, "screen_r1": 0}
        lose = {"screen_r2": 0, "screen_r1": 0}
        ndef = {"screen_r2": 0, "screen_r1": 0}
        for d in flow.DESIGNS:
            pts = by[(tag, d)]
            ref = [flow.scores(r)["r4"] for r in pts]
            lo = min(ref)
            sc = [flow.scores(r) for r in pts]
            reg = {s: [] for s in strategies}
            for seed in range(SEEDS):
                for s in strategies:
                    rng = random.Random(seed * 7919 + zlib.crc32(d.encode()) % 1000)
                    if s == "random_r4":
                        v, _ = random_search(pts, ref, B, rng)
                    elif s == "hillclimb_r4":
                        v, _ = hill_climb(pts, ref, B, rng)
                    elif s == "screen_r1":
                        v, _ = screen(pts, ref, [x["r1"] for x in sc], C1, B, rng)
                    else:
                        v, _ = screen(pts, ref, [x["r2"] for x in sc], C2, B, rng)
                    reg[s].append(None if v is None else (v / lo - 1) * 100)
            for s in strategies:
                if reg[s][0] is not None:
                    per[s].append(statistics.mean(reg[s]))
            for s in ("screen_r2", "screen_r1"):
                if reg[s][0] is not None:
                    ndef[s] += 1
                    diff = [a - b for a, b in zip(reg[s], reg["random_r4"])]
                    m, lo_, hi_ = mean_ci(diff, random.Random(1))
                    if hi_ < 0:
                        win[s] += 1
                    elif lo_ > 0:
                        lose[s] += 1
            summary[f"{tag}:{B}:{d}"] = {s: (statistics.mean(reg[s]) if reg[s][0] is not None else None) for s in strategies}
        cells = [f"{statistics.mean(per[s]):.2f}" if len(per[s]) == len(flow.DESIGNS) else "n/a" for s in strategies]
        out.append(f"{B} | " + " | ".join(cells) + f" | {win['screen_r2']} / {lose['screen_r2']} of {ndef['screen_r2']} | {win['screen_r1']} / {lose['screen_r1']} of {ndef['screen_r1']}")
    out.append("")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
