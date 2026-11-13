"""Milestone 7am: can a pseudo-count variance floor in the coder cells replace the 3-miss pilot guard, so a very good
coder gets into the cells design at small audits without losing coverage? (7al's next step.)

7al found that the best coder leaves the most on the table at small n: gratitude (Qwen2.5-1.5B, J 0.78) at n 500 has
an oracle width forecast of 0.669 but realises 0.980, because `neg_guard` 3 admits cells in only 10% of draws (a
250-item pilot rarely holds 3 human positives the coder labelled 0). The guard exists for coverage, not width: with
fewer misses the coder-negative cell's variance estimate is near zero and the interval undercovers (7q/7r: 84 to 87%;
7t: g10 83.8 and 87.4%). So the guard is a proxy for "the coder-negative cell's variance is estimated from too few
positives". This milestone tests the direct fix: drop the guard (neg_guard 0) and floor each coder cell's variance at
the pseudo-count variance p~(1 - p~), p~ = (k + a) / (m + 2a), in the allocation, the width forecast and the closing
interval (`audit_design.pseudo_var`, `plan_audit(..., pseudo=a)`). a = 2 is Agresti-Coull's plus-four; 6ac found a
plus-four floor applied to every group stratum over-covered (99 to 100%) at 1.4 to 1.7 times human-only's width, but
there every stratum was rare; here the coder-positive cell holds many positives and the floor should bind only in the
coder-negative cell when its audit is thin. Smaller a (0.5, 1) are swept because a = 2 may be too conservative.

Cells (39), all already committed with their seeds: 7ak's 27 (15 GoEmotions cells, Qwen2.5-0.5B and -1.5B, fear,
sadness, admiration, n 500 / 1,000 / 2,000, pilot n/2; 12 NaijaSenti cells, nb-in-language J 0.39 and English
lexicon J 0.03, 2/5/10% prevalence, n 600 / 2,000, pilot 0.3 n) and 7al's 12 held-out GoEmotions cells (gratitude,
curiosity, disapproval, anger; Qwen2.5-1.5B). Rules, every one with tau 0.1, guard 0 and width_margin 0 (the shipped
screen and forecast) except pooled:
  pooled;  shipped = neg_guard 3, pseudo 0 (replays 7ak/7al m=0);  raw0 = neg_guard 0, pseudo 0 (the control);
  a0.5, a1, a2 = neg_guard 0 with pseudo 0.5, 1, 2.
1,000 draws per cell (+/- 1.4 points on coverage); the goemo cells share pilots across rules, the NaijaSenti cells use
one stream per rule (7ak's design).

    python3 experiments/h7am_pseudo_guard.py forecast      # oracle predicted_ratio per cell and rule, no draws
    python3 experiments/h7am_pseudo_guard.py draws [reps]  # -> h7am_pseudo_guard_draws.txt
    python3 experiments/h7am_pseudo_guard.py summary       # applies the decision rule -> h7am_pseudo_guard.txt

Forecast (from `forecast`, before any draw): with the true cell variances the floor costs little: the oracle
predicted_ratio moves by at most +0.018 at a = 2 (0.5B fear n 500, 1.049 to 1.067) and by 0.000 to 0.017 elsewhere
(gratitude n 500: 0.669, 0.675, 0.680 at a = 0, 1, 2). So any width the floor costs in the draws comes from thin
audits, where it is meant to bind, not from the design.

Prediction (written and committed before any draw):
  P0  (replay) the shipped rule reproduces the committed 7ak / 7al m=0 ratios in all 39 cells to three decimals.
  P1  (control: the guard is doing real work) raw0 covers under 93% in at least one cell. If raw0 covers 93% or more
      everywhere, the guard was never needed on these cells and the floor is moot; reported as such.
  P2  a2 covers 93% or more in every cell.
  P3  gratitude n 500: a1 and a2 are each at least 0.05 narrower than the shipped rule's ratio (7al: 0.980), i.e.
      <= 0.930. Guess: a1 about 0.80, a2 about 0.85.
  P4  a2 is no more than 1.010 times pooled in every cell (the forecast still guards the cost cells).
  P5  a2's total gain (sum over the 39 cells of 1 - ratio) is at least the shipped rule's.
  Guess, not a test: a0.5 undercovers in at least one cell; a1 covers everywhere.
  Decision rule, fixed now: let a* be the smallest a in {0.5, 1, 2} that covers 93% or more in every cell, is <= 1.010
  everywhere and has a total gain at least the shipped rule's. If a* exists, the library default becomes
  NEG_GUARD 0, PSEUDO a* in this PR (every earlier script is pinned to neg_guard/pseudo as it ran). Otherwise the
  defaults stay and the summary reports what each a costs and buys.
"""
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
import h7ak_width_forecast as K  # noqa: E402
import h7al_heldout as L  # noqa: E402

# name, neg_guard, pseudo (all non-pooled rules: tau 0.1, guard 0, width_margin 0)
RULES = [("pooled", 0, 0.0), ("shipped", 3, 0.0), ("raw0", 0, 0.0), ("a0.5", 0, 0.5), ("a1", 0, 1.0), ("a2", 0, 2.0)]
OUT = HERE / "h7am_pseudo_guard_draws.txt"
HEAD = ("cell | n | J | rule | observed cells % | coverage % | half-width pts | ratio to pooled | "
        "mean coder-negative positives in the audit when cells")


def cells():
    yield from K.cells()
    yield from L.cells()


def committed():
    got = {}
    for name in ("h7ak_width_forecast_draws.txt", "h7al_heldout_draws.txt"):
        for line in (HERE / name).read_text().splitlines()[1:]:
            x = [s.strip() for s in line.split("|")]
            if x[3] == "m=0":
                got[(x[0], int(x[1]))] = float(x[7])
    return got


def run(c, reps):
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    res = {}
    if c["part"] == "goemo":
        rr = random.Random(c["seed"] + 5)
        pilots = [rr.sample(range(N), n // 2) for _ in range(reps)]
    for name, ng, a in RULES:
        out = []
        if c["part"] != "goemo":
            rr = random.Random(c["seed"])
        tau = 2.0 if name == "pooled" else A.TAU
        for d in range(reps):
            if c["part"] == "goemo":
                pilot, sb = pilots[d], random.Random(c["seed"] + 7 * d)
            else:
                pilot, sb = rr.sample(range(N), round(A.PILOT_SHARE * n)), rr
            labels = {i: h[i] for i in pilot}
            plan = A.plan_audit(f, labels, n, tau=tau, guard=0, neg_guard=ng, width_margin=0.0, pseudo=a)
            for cell, t in zip(plan["cells"], plan["to_label"]):
                for i in sb.sample([i for i in cell if i not in labels], t):
                    labels[i] = h[i]
            _, lo, hi = A.audit_interval(plan, f, labels)
            iscells = plan["design"] == "cells"
            negpos = sum(labels[i] for i in plan["cells"][0] if i in labels) if iscells else None
            out.append(((hi - lo) / 2, lo <= truth <= hi, iscells, negpos))
        res[name] = out
    return res


def one_cell(args):
    c, reps = args
    res = run(c, reps)
    wp = sum(x[0] for x in res["pooled"]) / reps
    lines = []
    for name, *_r in RULES:
        r = res[name]
        w = sum(x[0] for x in r) / reps
        k = [x[3] for x in r if x[3] is not None]
        mk = f"{sum(k) / len(k):.1f}" if k else "-"
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {100 * sum(x[2] for x in r) / reps:.1f} | "
                     f"{100 * sum(x[1] for x in r) / reps:.1f} | {100 * w:.3f} | {w / wp:.3f} | {mk}")
    print("\n".join(lines), flush=True)
    return lines


def draws(reps):
    cs = list(cells())
    with Pool(4) as p:
        got = p.map(one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([HEAD] + [l for g in got for l in g]) + "\n")


def summary():
    rows = []
    for line in OUT.read_text().splitlines()[1:]:
        cell, n, J, rule, obs, cov, hw, ratio, mk = [x.strip() for x in line.split("|")]
        rows.append(dict(cell=cell, n=int(n), J=float(J), rule=rule, obs=float(obs), cov=float(cov),
                         ratio=float(ratio), mk=mk))
    by = {(r["cell"], r["n"], r["rule"]): r for r in rows}
    keys = list(dict.fromkeys((r["cell"], r["n"]) for r in rows))
    com = committed()
    out = [f"cells run: {len(keys)}"]
    diff = [k for k in keys if k in com and abs(com[k] - by[(*k, 'shipped')]["ratio"]) > 0.0005]
    out.append(f"P0 replay of committed 7ak/7al m=0 ratios: {len(keys) - len(diff)} of {len(keys)} identical; "
               f"differ {diff}")
    for k in keys:
        out.append(f"{k[0]} n {k[1]} (J {by[(*k, 'pooled')]['J']:.3f}; pooled cov {by[(*k, 'pooled')]['cov']:.1f}): "
                   + ", ".join(f"{nm} {by[(*k, nm)]['ratio']:.3f} ({by[(*k, nm)]['obs']:.0f}% cells, cov "
                               f"{by[(*k, nm)]['cov']:.1f}, neg-cell positives {by[(*k, nm)]['mk']})"
                               for nm, *_r in RULES[1:]))

    def low(nm):
        return [(k, by[(*k, nm)]["cov"]) for k in keys if by[(*k, nm)]["cov"] < 93.0]

    def over(nm):
        return [(k, by[(*k, nm)]["ratio"]) for k in keys if by[(*k, nm)]["ratio"] > 1.010]

    def gain(nm):
        return sum(1 - by[(*k, nm)]["ratio"] for k in keys)

    for nm, *_r in RULES[1:]:
        out.append(f"{nm}: total gain {gain(nm):.3f}; min coverage {min(by[(*k, nm)]['cov'] for k in keys):.1f}; "
                   f"cells under 93%: {low(nm)}; cells above 1.010: {over(nm)}")
    out.append(f"P1 raw0 under 93% somewhere: {'yes' if low('raw0') else 'no (guard not needed on these cells)'}")
    out.append(f"P2 a2 covers >= 93% everywhere: {'yes' if not low('a2') else 'no'}")
    g = ("1.5B gratitude", 500)
    if (*g, "a1") in by:
        s = by[(*g, "shipped")]["ratio"]
        out.append(f"P3 gratitude n 500 a1 {by[(*g, 'a1')]['ratio']:.3f}, a2 {by[(*g, 'a2')]['ratio']:.3f} vs shipped "
                   f"{s:.3f}: {'yes' if max(by[(*g, 'a1')]['ratio'], by[(*g, 'a2')]['ratio']) <= s - 0.05 else 'no'}")
    out.append(f"P4 a2 <= 1.010 everywhere: {'yes' if not over('a2') else 'no'}")
    out.append(f"P5 a2 total gain >= shipped: {'yes' if gain('a2') >= gain('shipped') else 'no'} "
               f"({gain('a2'):.3f} vs {gain('shipped'):.3f})")
    star = next((nm for nm in ("a0.5", "a1", "a2") if not low(nm) and not over(nm) and gain(nm) >= gain("shipped")),
                None)
    out.append("Decision rule: " + (f"a* = {star}; default becomes NEG_GUARD 0, PSEUDO {star[1:]}" if star else
                                    "no a qualifies; defaults stay (NEG_GUARD 3, PSEUDO 0)"))
    text = "\n".join(out); print(text); (HERE / "h7am_pseudo_guard.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "forecast"
    if mode == "forecast":
        print("cell | n | J | oracle predicted_ratio pseudo 0 | 1 | 2")
        for c in cells():
            o = [A.predicted_ratio(c["f"], dict(enumerate(c["h"])), c["n"], pseudo=a) for a in (0, 1, 2)]
            print(f"{c['label']} | {c['n']} | {c['J']:.3f} | " + " | ".join(f"{x:.3f}" for x in o), flush=True)
    elif mode == "summary":
        summary()
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
