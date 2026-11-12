"""Milestone 7aj: at small audits, is the cells design's width cost a negative-cell guard set too low, and does a
larger `neg_guard` remove it without giving back the large-audit gain? (7ai's next step: "a small-n rule".)

7ai changed the library default to TAU 0.1, GUARD 0, NEG_GUARD 3. Its stated trade: at n 500 the default is 1.4 to
2.7% *wider* than pooled for the two weaker coders (Qwen2.5-0.5B fear and sadness, Qwen2.5-1.5B fear), where it is
6 to 29% narrower at n 2,000. The guard counts pilot positives the coder missed (7ae, 7af); a pilot that holds only
3 or 4 such misses estimates the coder-negative cell's variance from a handful of positives, so the Neyman
allocation it drives is noisy and the floor of 0.35 n per cell is paid for little. Hypothesis: raising `neg_guard`
(the minimum number of misses the pilot must see) sends those thin pilots to pooled, which removes the n 500 cost,
while at n 2,000 the pilot's miss count is large enough that a guard of 5 or 8 rarely bites.

Cells: GoEmotions test part (6,683 items), the cached zero-shot scores of 7aa/7y: Qwen2.5-0.5B-Instruct fear and
sadness (J 0.26), Qwen2.5-1.5B-Instruct fear, sadness and admiration (J 0.46 to 0.65); n 500, 1,000 and 2,000
(n 1,000 is new for these coders), pilot n/2; 7y's pipeline, cut rule and seeds (`h7ai_weak_llm_tau.cells`).
Rules: pooled, and tau 0.1, guard 0 with neg_guard k in {3 (the library default), 5, 8}. 1,000 draws per cell
(+/- 1.4 points on coverage). Forecast column: `audit_design.cells_probability(..., neg_guard=k, tau=0.1)`.

    python3 experiments/h7aj_neg_guard.py forecast      # forecasts only, no draws (run first; pasted below)
    python3 experiments/h7aj_neg_guard.py draws [reps]  # -> h7aj_neg_guard_draws.txt
    python3 experiments/h7aj_neg_guard.py summary       # reads it, applies the decision rule -> h7aj_neg_guard.txt

Forecasts (from `forecast`, before any draw ran; exact `cells_probability`, % of draws using coder cells):
  cell | n | J | pilot | expected pilot misses | k=3 | k=5 | k=8
  0.5B fear | 500 | 0.264 | 250 | 2.1 | 19.1 | 3.0 | 0.0
  0.5B fear | 1000 | 0.264 | 500 | 4.1 | 62.7 | 30.2 | 2.5
  0.5B fear | 2000 | 0.264 | 1000 | 8.2 | 89.3 | 83.3 | 50.8
  0.5B sadness | 500 | 0.265 | 250 | 3.9 | 57.5 | 23.1 | 2.1
  0.5B sadness | 1000 | 0.265 | 500 | 7.8 | 87.3 | 78.6 | 44.0
  0.5B sadness | 2000 | 0.265 | 1000 | 15.6 | 96.6 | 96.6 | 95.8
  1.5B fear | 500 | 0.461 | 250 | 1.5 | 14.1 | 1.2 | 0.0
  1.5B fear | 1000 | 0.461 | 500 | 3.0 | 55.0 | 16.4 | 0.7
  1.5B fear | 2000 | 0.461 | 1000 | 6.0 | 94.5 | 72.9 | 23.7
  1.5B sadness | 500 | 0.623 | 250 | 1.8 | 27.1 | 3.3 | 0.0
  1.5B sadness | 1000 | 0.623 | 500 | 3.7 | 72.0 | 30.3 | 2.7
  1.5B sadness | 2000 | 0.623 | 1000 | 7.3 | 98.4 | 87.7 | 45.5
  1.5B admiration | 500 | 0.649 | 250 | 3.2 | 62.2 | 21.2 | 1.4
  1.5B admiration | 1000 | 0.649 | 500 | 6.4 | 95.9 | 77.3 | 30.2
  1.5B admiration | 2000 | 0.649 | 1000 | 12.7 | 100.0 | 99.7 | 95.2
  (corpus 6,683 in every row.) The k=3 n 500 and n 2,000 rows replay 7ai's tau 0.1 forecasts. Read before the draws:
  k=5 empties the n 500 cells design almost entirely (1 to 23% of draws), but it also costs share where the gain is,
  e.g. 1.5B fear n 2,000 drops from 94.5 to 72.9% and every n 1,000 row loses 9 to 43 points. So k=5 may give back
  part of the gain; k=8 surely does (n 1,000 nearly all pooled). My guess: k=5 keeps 75 to 90% of the k=3 gain.

Prediction (written before the draws):
  P1  |forecast - observed share| <= max(5 points, 3 binomial SEs at 1,000 draws) in all 45 (cell, k) rows.
  P2  every rule covers 93% or more in all 15 cells.
  P3  k=5 brings every n 500 cell that is wider than pooled at k=3 to a ratio <= 1.010.
  P4  k=5 keeps >= 90% of the k=3 gain (sum of 1 - ratio over the cells with k=3 ratio < 0.97). Given the
      forecasts I expect this one may fail; it is the bar a default change has to clear.
  P5  k=8 keeps under 90% of that gain.
  Decision rule, fixed now: if P2, P3 and P4 hold and no cell has a k=5 ratio above 1.010, the library default
  changes to NEG_GUARD 5 in this PR; otherwise it stays 3, and the summary reports what the small-n fix costs.
  Refuted: P1 if any row misses; P2 if any row is under 93%; P3 to P5 if their inequality fails.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
import h7ah_tau as H  # noqa: E402
import h7ai_weak_llm_tau as W  # noqa: E402

TAU = 0.1
KS = (3, 5, 8)
NS = (500, 1000, 2000)
RULES = [("pooled", 2.0, 0, 0)] + [(f"k={k}", TAU, 0, k) for k in KS]
OUT = HERE / "h7aj_neg_guard_draws.txt"


def cells():
    old = H.GO_NS
    H.GO_NS = NS
    try:
        yield from W.cells()
    finally:
        H.GO_NS = old


def forecasts(c):
    N = len(c["h"])
    return [100 * A.cells_probability(c["pilot"], c["tp"], c["fn"], c["fp"], N, neg_guard=k, tau=TAU) for k in KS]


def expected_misses(c):
    """Expected coder misses in the pilot: pilot x corpus misses / corpus (the planner's quantity, 7ae/7af)."""
    return c["pilot"] * c["fn"] / len(c["h"])


def run(c, reps):
    old = H.RULES
    H.RULES = RULES
    try:
        return H.run_goemo(c, reps)
    finally:
        H.RULES = old


def draws(reps):
    out = [H.HEAD]
    for c in cells():
        q = forecasts(c)
        res = run(c, reps)
        wp = sum(x[0] for x in res["pooled"]) / reps
        for k, (name, *_r) in enumerate(RULES):
            r = res[name]
            w = sum(x[0] for x in r) / reps
            fc = "-" if k == 0 else f"{q[k - 1]:.1f}"
            line = (f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {fc} | {100 * sum(x[2] for x in r) / reps:.1f}"
                    f" | {100 * sum(x[1] for x in r) / reps:.1f} | {100 * w:.3f} | {w / wp:.3f}")
            out.append(line); print(line, flush=True)
        OUT.write_text("\n".join(out) + "\n")


def summary():
    rows = []
    for line in OUT.read_text().splitlines()[1:]:
        cell, n, J, rule, fc, obs, cov, hw, ratio = [x.strip() for x in line.split("|")]
        rows.append(dict(cell=cell, n=int(n), J=float(J), rule=rule, fc=fc, obs=float(obs), cov=float(cov),
                         ratio=float(ratio)))
    by = {(r["cell"], r["n"], r["rule"]): r for r in rows}
    keys = sorted({(r["cell"], r["n"]) for r in rows}, key=lambda k: (k[0], k[1]))
    out = []

    def tol(q, reps=1000):
        return max(5.0, 300 * ((q / 100) * (1 - q / 100) / reps) ** 0.5)
    p1 = [(r, abs(float(r["fc"]) - r["obs"])) for r in rows if r["fc"] != "-"]
    miss = [(r["cell"], r["n"], r["rule"], round(d, 1)) for r, d in p1 if d > tol(float(r["fc"]))]
    out.append(f"P1 forecast within max(5 points, 3 SE): {len(p1) - len(miss)} of {len(p1)}; misses {miss}; "
               f"largest gap {max(d for _, d in p1):.1f}")
    low = [(r["cell"], r["n"], r["rule"], r["cov"]) for r in rows if r["cov"] < 93.0]
    out.append(f"P2 coverage >= 93% in every cell and rule: {'yes' if not low else 'no ' + str(low)}")
    for k in keys:
        out.append(f"{k[0]} n {k[1]}: " + ", ".join(
            f"{name} {by[(k[0], k[1], name)]['ratio']:.3f} ({by[(k[0], k[1], name)]['obs']:.0f}% cells)"
            for name, *_r in RULES[1:]))
    costly = [k for k in keys if k[1] == 500 and by[(k[0], k[1], "k=3")]["ratio"] > 1.0]
    gain = [k for k in keys if by[(k[0], k[1], "k=3")]["ratio"] < 0.97]
    res = {}
    for name, *_r in RULES[1:]:
        worst = max((by[(k[0], k[1], name)]["ratio"] for k in costly), default=float("nan"))
        worst_all = max(by[(k[0], k[1], name)]["ratio"] for k in keys)
        g = sum(1 - by[(k[0], k[1], name)]["ratio"] for k in gain)
        g3 = sum(1 - by[(k[0], k[1], "k=3")]["ratio"] for k in gain)
        res[name] = (worst, worst_all, g / g3 if g3 > 0 else float("nan"))
        out.append(f"{name}: worst ratio in the {len(costly)} n-500 cells wider than pooled at k=3 {worst:.3f}; "
                   f"worst ratio in any cell {worst_all:.3f}; keeps {100 * res[name][2]:.0f}% of the k=3 gain "
                   f"summed over the {len(gain)} cells with k=3 ratio < 0.97")
    w5, a5, keep5 = res["k=5"]
    out.append(f"P3 k=5 brings every costly n-500 cell to ratio <= 1.010: {'yes' if w5 <= 1.010 else 'no'}")
    out.append(f"P4 k=5 keeps >= 90% of the k=3 gain: {'yes' if keep5 >= 0.90 else 'no'}")
    w8, a8, keep8 = res["k=8"]
    out.append(f"P5 k=8 keeps < 90% of the k=3 gain: {'yes' if keep8 < 0.90 else 'no'}")
    ok = not low and w5 <= 1.010 and keep5 >= 0.90 and a5 <= 1.010
    out.append(f"Decision rule: {'change NEG_GUARD to 5' if ok else 'keep NEG_GUARD 3'}")
    text = "\n".join(out); print(text); (HERE / "h7aj_neg_guard.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "forecast"
    if mode == "forecast":
        print("cell | n | corpus | J | pilot | expected pilot misses | "
              + " | ".join(f"forecast % k={k}" for k in KS))
        for c in cells():
            print(f"{c['label']} | {c['n']} | {len(c['h'])} | {c['J']:.3f} | {c['pilot']} | "
                  f"{expected_misses(c):.1f} | " + " | ".join(f"{x:.1f}" for x in forecasts(c)), flush=True)
    elif mode == "summary":
        summary()
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
