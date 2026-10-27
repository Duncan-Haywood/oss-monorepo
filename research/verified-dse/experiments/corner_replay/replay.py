"""Milestone 26: replay of the milestone 13 strategy grid on the ss_100C_1v60 table (corner_ss), plus an eta picked on the tt table.
Same cost model, pools, seeds and regret as milestones 3, 9 and 11 (experiments/hedge/replay.py).
Runs no flow. Writes results.txt and summary.json. Usage: python3 sweep.py"""
import json
import random
import statistics
import sys
import zlib
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

M = statistics.mean
SEEDS = 400
ETAS = (1.1, 1.25, 1.5, 2, 3, "f2", "f3")  # "fK": no cut after R2, keep 1/K after R3
TABLES = {
    "tt": (HERE.parent / "rung_bias" / "results.jsonl", (10, 20, 30, 45), None),
    "ss": (HERE.parent / "corner_ss" / "results.jsonl", (10, 20, 30, 45), None),
}
XMEAN = {}  # (table, tag, budget) -> {(design, strategy): mean regret %}


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
    """(cut after R2, cut after R3) as divisors."""
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
    out.append(f"# table {name}: {len(ds)} designs; {SEEDS} paired seeds; eta chosen leave-one-design-out\n")
    # fixed-eta columns: 1.1, 1.25, 1.5, 2, 3, f2, f3 (see ETAS)
    for tag in ("tight", "relaxed"):
        out.append(f"## {name}, clock {tag}: mean held-out regret % over designs")
        out.append("budget s | random_r4 | chosen eta (wins/losses vs random) | fixed: " + " ; ".join(str(e) for e in ETAS) + " | oracle | modal chosen (counts)")
        for B in budgets:
            reg = {}
            for d in ds:
                pool = by[(tag, d)]
                sc = [flow.scores(r) for r in pool]
                ref = [x["r4"] for x in sc]
                lo = min(ref)
                for s in ("rand",) + ETAS:
                    vals = []
                    for seed in range(SEEDS):
                        rng = random.Random(seed * 7919 + zlib.crc32(d.encode()) % 1000)
                        v = random_r4(C, ref, B, rng) if s == "rand" else run_sh(C, sc, ref, B, s, rng)
                        vals.append(None if v is None else (v / lo - 1) * 100)
                    reg[(d, s)] = vals
            ok = [e for e in ETAS if all(reg[(d, e)][0] is not None for d in ds)]
            if not ok or reg[(ds[0], "rand")][0] is None:
                out.append(f"{B} | n/a (a strategy has no feasible plan)")
                continue
            mean = {(d, s): M(reg[(d, s)]) for d in ds for s in ("rand",) + tuple(ok)}
            chosen, held, wl = {}, [], [0, 0]
            for d in ds:
                others = [x for x in ds if x != d]
                e = min(ok, key=lambda e: (M(mean[(x, e)] for x in others), ETAS.index(e)))
                chosen[d] = e
                held.append(mean[(d, e)])
                diff = [a - b for a, b in zip(reg[(d, e)], reg[(d, "rand")])]
                l, h = ci(diff, random.Random(1))
                wl[0] += h < 0
                wl[1] += l > 0
            XMEAN[(name, tag, B)] = (ds, ok, mean)
            fixed = {e: M(mean[(d, e)] for d in ds) for e in ok}
            oracle = M(min(mean[(d, e)] for e in ok) for d in ds)
            cnt = Counter(chosen.values()).most_common()
            out.append(f"{B} | {M(mean[(d, 'rand')] for d in ds):.2f} | {M(held):.2f} ({wl[0]}/{wl[1]}) | "
                       + " ; ".join(f"{fixed.get(e, float('nan')):.2f}" for e in ETAS) + f" | {oracle:.2f} | "
                       + ", ".join(f"{e}:{c}" for e, c in cnt))
            summary[f"{name}:{tag}:{B}"] = {"random": M(mean[(d, 'rand')] for d in ds), "chosen": M(held),
                                           "fixed": {str(e): v for e, v in fixed.items()}, "oracle": oracle,
                                           "chosen_by_design": {d: chosen[d] for d in ds}}
        out.append("")
out.append("# eta chosen on the tt table (mean over its 10 designs), applied to ss, vs ss's own best fixed eta and random R4")
for tag in ("tight", "relaxed"):
    out.append(f"## clock {tag}: budget s | eta from tt | its ss regret % | random_r4 at ss | best fixed eta at ss (regret %)")
    for B in TABLES["ss"][1]:
        if ("tt", tag, B) not in XMEAN or ("ss", tag, B) not in XMEAN:
            continue
        dt, okt, mt = XMEAN[("tt", tag, B)]
        ds_, oks, ms = XMEAN[("ss", tag, B)]
        common = [e for e in okt if e in oks]
        et = min(common, key=lambda e: (M(mt[(x, e)] for x in dt), ETAS.index(e)))
        es = min(common, key=lambda e: (M(ms[(x, e)] for x in ds_), ETAS.index(e)))
        out.append(f"{B} | {et} | {M(ms[(x, et)] for x in ds_):.2f} | {M(ms[(x, 'rand')] for x in ds_):.2f} | {es} ({M(ms[(x, es)] for x in ds_):.2f})")
        summary[f"cross:{tag}:{B}"] = {"eta_tt": str(et), "ss_regret": M(ms[(x, et)] for x in ds_), "random_ss": M(ms[(x, 'rand')] for x in ds_), "eta_ss": str(es), "ss_best": M(ms[(x, es)] for x in ds_)}
    out.append("")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
