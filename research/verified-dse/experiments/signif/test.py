"""Milestone 14: paired significance of gentle-cut successive halving against random R4, and a per-family fold.
Reuses the milestone 13 cost model, pools, seeds and regret (experiments/eta_floor/sweep.py, copied functions).
Runs no flow. Writes results.txt and summary.json. Usage: python3 test.py"""
import itertools
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

M = statistics.mean
SEEDS = 400
ARMS = (1.25, 1.5, 2, "f3")
ALL = (1.1, 1.25, 1.5, 2, 3, "f2", "f3")
TABLES = {
    "small": (HERE.parent / "rung_bias" / "results.jsonl", (10, 20, 30, 45), None),
    "large": (HERE.parent / "large" / "results.jsonl", (100, 200, 400, 600, 900),
              ["mult16", "mult24", "mult32", "adder_op64", "adder_ripple64"]),
}
FAMILY = {"adder_op16": "adder", "adder_ripple16": "adder", "adder_op64": "adder", "adder_ripple64": "adder",
          "mult8": "mult", "mult16": "mult", "mult24": "mult", "mult32": "mult"}


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


def plan(C, B, eta, size):
    n0 = 0
    for n in range(1, size + 1):
        if sh_cost(C, n, eta) <= B:
            n0 = n
        else:
            break
    return n0


def run_sh(C, sc, ref, B, eta, rng):
    n0 = plan(C, B, eta, len(ref))
    if n0 == 0:
        return None
    cur = rng.sample(range(len(ref)), n0)
    keep = n0
    for k, rg in enumerate(("r2", "r3", "r4")):
        cur = sorted(cur, key=lambda i: (sc[i][rg], rng.random()))
        keep = shrink(keep, cuts(eta)[min(k, 1)])
        if k < 2:
            cur = cur[:keep]
    return min(ref[i] for i in cur)


def random_r4(C, ref, B, rng):
    ids = list(range(len(ref)))
    rng.shuffle(ids)
    return min(ref[i] for i in ids[:max(int(B // C["full"]), 1)])


def ci(x, rng):
    bs = sorted(M(rng.choices(x, k=len(x))) for _ in range(500))
    return bs[12], bs[487]


def wilcoxon_exact(d):
    """Two-sided exact signed-rank p for H0: symmetric about 0 (zeros dropped, average ranks)."""
    d = [x for x in d if abs(x) > 1e-12]
    n = len(d)
    if n == 0:
        return 1.0
    order = sorted(range(n), key=lambda i: abs(d[i]))
    ranks, i = [0.0] * n, 0
    while i < n:
        j = i
        while j + 1 < n and abs(abs(d[order[j + 1]]) - abs(d[order[i]])) < 1e-9:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    obs = abs(sum(r for r, x in zip(ranks, d) if x > 0) - sum(r for r, x in zip(ranks, d) if x < 0))
    hit = sum(abs(sum(s * r for s, r in zip(signs, ranks))) >= obs - 1e-9
              for signs in itertools.product((1, -1), repeat=n))
    return hit / 2 ** n


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, run = [0.0] * len(ps), 0.0
    for rank, i in enumerate(order):
        run = max(run, min(1.0, (len(ps) - rank) * ps[i]))
        adj[i] = run
    return adj


out, summary = [], {}
for name, (path, budgets, designs) in TABLES.items():
    rows = [json.loads(l) for l in path.read_text().splitlines()]
    tight = [r for r in rows if r["status"] == "ok" and r["tag"] == "tight"]
    C = costs(tight)
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(r)
    ds = designs or sorted({d for _, d in by})
    for tag in ("tight", "relaxed"):
        cells = []  # (arm, B, per-design mean diff, per-design CI, wins, losses)
        fam_out = []
        for B in budgets:
            reg = {}
            for d in ds:
                pool = by[(tag, d)]
                sc = [flow.scores(r) for r in pool]
                ref = [x["r4"] for x in sc]
                lo = min(ref)
                for s in ("rand",) + ALL:
                    vals = []
                    for seed in range(SEEDS):
                        rng = random.Random(seed * 7919 + zlib.crc32(d.encode()) % 1000)
                        v = random_r4(C, ref, B, rng) if s == "rand" else run_sh(C, sc, ref, B, s, rng)
                        vals.append(None if v is None else (v / lo - 1) * 100)
                    reg[(d, s)] = vals
            mean = {k: M(v) for k, v in reg.items() if v[0] is not None}
            for a in ARMS:
                if any((d, a) not in mean for d in ds):
                    continue
                dm, w, l = [], 0, 0
                for d in ds:
                    diff = [x - y for x, y in zip(reg[(d, a)], reg[(d, "rand")])]
                    dm.append(M(diff))
                    lo_, hi_ = ci(diff, random.Random(1))
                    w += hi_ < 0
                    l += lo_ > 0
                cells.append((a, B, dm, w, l))
            ok = [e for e in ALL if all((d, e) in mean for d in ds)]
            fams = sorted({FAMILY.get(d, d) for d in ds})
            held = []
            for f in fams:
                te = [d for d in ds if FAMILY.get(d, d) == f]
                tr = [d for d in ds if FAMILY.get(d, d) != f]
                e = min(ok, key=lambda e: (M(mean[(x, e)] for x in tr), ALL.index(e)))
                held += [(d, e, mean[(d, e)]) for d in te]
            fam_out.append(f"{B} | random {M(mean[(d, 'rand')] for d in ds):.2f} | family-fold chosen {M(h[2] for h in held):.2f} | "
                           + ", ".join(f"{d}:{e}" for d, e, _ in held if FAMILY.get(d, d) in ("adder", "mult") or name == "small" and e not in (1.25, 1.5)) )
        raw = [wilcoxon_exact(dm) for _, _, dm, _, _ in cells]
        adj = holm(raw)
        out.append(f"## {name}, clock {tag}: arm minus random R4, regret percentage points (negative favours the arm), exact two-sided Wilcoxon over {len(ds)} designs")
        out.append(f"smallest attainable p with {len(ds)} designs: {2 / 2 ** len(ds):.4f}; Holm over {len(cells)} cells")
        out.append("arm | budget s | mean diff | designs better/worse (95% seed CI excludes 0) | p raw | p Holm")
        for (a, B, dm, w, l), p, q in zip(cells, raw, adj):
            out.append(f"{a} | {B} | {M(dm):+.2f} | {w}/{l} | {p:.4f} | {q:.4f}")
            summary[f"{name}:{tag}:{a}:{B}"] = {"mean_diff": M(dm), "better": w, "worse": l, "p": p, "p_holm": q,
                                              "per_design": dict(zip(ds, dm))}
        out.append("")
        out.append(f"### {name}, {tag}: leave-one-family-out choice among all 7 arms (adder family and mult family leave together)")
        out.append("budget s | random | held-out family-fold mean | designs whose choice is not 1.25/1.5 (adder, mult listed)")
        out += fam_out
        out.append("")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
