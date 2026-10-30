"""Milestone 17: pilot size and held-out threshold for the R2-to-R3 gate of milestone 16 (same tables, cost model, seeds, regret).
Runs no flow. Writes results.txt and summary.json. Usage: python3 sweep.py"""
import json
import random
import statistics
import sys
import zlib
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow, stats  # noqa: E402

M = statistics.mean
SEEDS = 400
PILOTS = (3, 5, 8, 10)
THETAS = (0.3, 0.5, 0.7, 0.9)
BUDGETS = (15, 25, 40)
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


def plan(C, B, eta, size):
    n0 = 0
    for n in range(1, size + 1):
        if sh_cost(C, n, eta) <= B:
            n0 = n
        else:
            break
    return n0


def run_sh(C, sc, ref, ids, B, eta, rng):
    n0 = plan(C, B, eta, len(ids))
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


def pilot_run(C, sc, ref, B, m, thetas, rng):
    """One pilot draw of m points; returns {theta: value} for every theta (the pilot and its tau are shared) plus tau."""
    ids = list(range(len(ref)))
    pilot = rng.sample(ids, m)
    rest = [i for i in ids if i not in pilot]
    tau = stats.kendall_tau_b([sc[i]["r2"] for i in pilot], [sc[i]["r3"] for i in pilot])
    left = B - m * C["full"]
    base = min(ref[i] for i in pilot)
    out = {}
    for th in thetas:
        arm = 1.5 if (tau is not None and tau >= th) else "f3"
        if left <= 0:
            out[th] = base
        else:
            v = run_sh(C, sc, ref, rest, left, arm, rng)
            out[th] = base if v is None else min(base, v)
    return out, tau


def auc(pos, neg):
    return M((p > q) + 0.5 * (p == q) for p in pos for q in neg)


reg, cell_info = {}, {}
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
        cell = (tag, d)
        cell_info[cell] = {"r2_regret": stats.pick_regret([s["r2"] for s in sc], ref) * 100}
        pct = lambda v: None if v is None else (v / lo - 1) * 100
        for B in BUDGETS:
            Bc = B * C["full"]
            for sd in range(SEEDS):
                key = lambda tail: random.Random(sd * 7919 + zlib.crc32(d.encode()) % 1000 + tail)
                ids = list(range(len(ref)))
                rr = key(1)
                rr.shuffle(ids)
                reg.setdefault((cell, B, "rand"), []).append(pct(min(ref[i] for i in ids[:max(int(B), 1)])))
                for arm in (1.5, "f3"):
                    reg.setdefault((cell, B, f"fixed{arm}"), []).append(pct(run_sh(C, sc, ref, ids, Bc, arm, key(2))))
                for m in PILOTS:
                    vals, tau = pilot_run(C, sc, ref, Bc, m, THETAS, key(3 + m))
                    for th in THETAS:
                        reg.setdefault((cell, B, f"m{m}_t{th}"), []).append(pct(vals[th]))
                    if B == BUDGETS[0]:
                        cell_info[cell].setdefault(f"tau{m}", []).append(tau)
for k, v in list(reg.items()):
    reg[k] = None if None in v else M(v)

cells = sorted(cell_info)
designs = sorted({c[1] for c in cells})
arms = ["rand", "fixed1.5", "fixedf3"] + [f"m{m}_t{th}" for m in PILOTS for th in THETAS]
out = [f"# milestone 17: pilot size and threshold sweep, R2-to-R3 gate, {len(cells)} cells, {SEEDS} paired seeds\n"]
summary = {}
out.append("## mean regret % over all cells, in-sample")
out.append("budget | " + " | ".join(arms))
for B in BUDGETS:
    row = []
    for a in arms:
        v = [reg[(c, B, a)] for c in cells]
        row.append("n/a" if None in v else f"{M(v):.2f}")
    out.append(f"{B} | " + " | ".join(row))
    summary[str(B)] = dict(zip(arms, row))
out.append("\n## held-out threshold (leave one design out; theta chosen per budget and m on the other designs, both clocks), mean regret %")
out.append("budget | m | held-out | best fixed theta in-sample | f3 | eta1.5 | rand")
held = {}
for B in BUDGETS:
    f3 = M(reg[(c, B, "fixedf3")] for c in cells)
    e15 = M(reg[(c, B, "fixed1.5")] for c in cells)
    rd = M(reg[(c, B, "rand")] for c in cells)
    for m in PILOTS:
        tot = []
        for d in designs:
            tr = [c for c in cells if c[1] != d]
            th = min(THETAS, key=lambda t: M(reg[(c, B, f"m{m}_t{t}")] for c in tr))
            tot += [reg[(c, B, f"m{m}_t{th}")] for c in cells if c[1] == d]
        ins = min(M(reg[(c, B, f"m{m}_t{t}")] for c in cells) for t in THETAS)
        held[(B, m)] = M(tot)
        out.append(f"{B} | {m} | {M(tot):.2f} | {ins:.2f} | {f3:.2f} | {e15:.2f} | {rd:.2f}")
        summary[f"heldout_B{B}_m{m}"] = {"heldout": M(tot), "insample_best": ins, "f3": f3}
out.append("\n## pilot tau(R2,R3) by pilot size: mean within-cell sd, and AUC of cell-mean tau for 'R2 pick regret > 10%'")
bad = [c for c in cells if cell_info[c]["r2_regret"] > 10]
good = [c for c in cells if cell_info[c]["r2_regret"] <= 10]
for m in PILOTS:
    mt = {c: M(t for t in cell_info[c][f"tau{m}"] if t is not None) for c in cells}
    sd = M(statistics.pstdev([t for t in cell_info[c][f"tau{m}"] if t is not None]) for c in cells)
    a = auc([-mt[c] for c in bad], [-mt[c] for c in good])
    out.append(f"m={m}: sd {sd:.2f}, AUC {a:.2f} ({len(bad)} bad / {len(good)} other cells)")
    summary[f"auc_m{m}"] = a
    summary[f"sd_m{m}"] = sd
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
