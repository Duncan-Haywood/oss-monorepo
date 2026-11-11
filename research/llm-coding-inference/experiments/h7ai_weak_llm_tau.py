"""Milestone 7ai: does a tau of 0.1 to 0.2 (guard 0, neg_guard 3) still keep the width a coder of middling
informedness buys, and how much of the shipped screen's cost is guard 20 rather than tau 0.3? (7ah's next step.)

7ah picked tau 0.1 (0.1 to 0.2 supported) on coders at the two extremes: a near-useless lexicon (J 0.03) and
informative coders (J 0.39 to 0.65). No coder between them was tried, which is where a tau of 0.2 would start to cost.
Here: the cached Qwen2.5-0.5B-Instruct zero-shot scores for GoEmotions fear and sadness (7aa: J 0.264 and 0.265),
n 500 and 2,000, pilot n/2, with 7y's pipeline, cut rule and seeds (`h7ah_tau.goemo_cells` with the model swapped),
plus the three 1.5B cells of 7ah (fear, sadness, admiration) for the guard question. Rules: pooled; tau in
{0, 0.1, 0.2, 0.3} with guard 0, neg_guard 3; and the shipped default (tau 0.3, guard 20, neg_guard 3).
1,000 draws per cell (+/- 1.4 points on coverage). The forecast column is `audit_design.cells_probability`
(guard 0 only; the shipped rule has no exact forecast).

    python3 experiments/h7ai_weak_llm_tau.py forecast      # forecasts only, no draws (run first; pasted below)
    python3 experiments/h7ai_weak_llm_tau.py draws [reps]  # -> h7ai_weak_llm_tau_draws.txt
    python3 experiments/h7ai_weak_llm_tau.py summary       # reads it, applies the decision rule -> h7ai_weak_llm_tau.txt

Forecasts (from `forecast`, before any draw ran; exact `cells_probability`, % of draws using coder cells):
  cell | n | corpus | J | pilot | forecast % tau 0.0 | forecast % tau 0.1 | forecast % tau 0.2 | forecast % tau 0.3
  0.5B fear | 500 | 6683 | 0.264 | 250 | 19.3 | 19.1 | 13.6 | 5.7
  0.5B fear | 2000 | 6683 | 0.264 | 1000 | 96.5 | 89.3 | 67.9 | 37.8
  0.5B sadness | 500 | 6683 | 0.265 | 250 | 64.1 | 57.5 | 39.0 | 23.4
  0.5B sadness | 2000 | 6683 | 0.265 | 1000 | 99.9 | 96.6 | 75.8 | 34.7
  1.5B fear | 500 | 6683 | 0.461 | 250 | 14.2 | 14.1 | 12.0 | 7.1
  1.5B fear | 2000 | 6683 | 0.461 | 1000 | 94.9 | 94.5 | 91.8 | 82.8
  1.5B sadness | 500 | 6683 | 0.623 | 250 | 27.2 | 27.1 | 25.4 | 23.2
  1.5B sadness | 2000 | 6683 | 0.623 | 1000 | 98.4 | 98.4 | 98.4 | 98.3
  1.5B admiration | 500 | 6683 | 0.649 | 250 | 62.2 | 62.2 | 62.2 | 62.2
  1.5B admiration | 2000 | 6683 | 0.649 | 1000 | 100.0 | 100.0 | 100.0 | 100.0
  The 1.5B rows replay 7ah's tau 0 to 0.2 forecasts. For the J 0.26 coder at n 2,000 tau 0.1 costs 3 to 7 points of
  share, tau 0.2 costs 24 to 29 and tau 0.3 about 60. Fear's prevalence is 1.15% (7aa), so a 1,000-item pilot holds
  about 11 positives and guard 20 should send nearly every fear draw to pooled whatever tau is.

Prediction (written before the draws):
  P1  |forecast - observed share| <= max(5 points, 3 binomial SEs at 1,000 draws) in all 40 guard-0 (cell, tau) rows.
  P2  every rule covers 93% or more in all 10 cells.
  P3  the 0.5B cells whose tau 0 width ratio is under 0.97 (expected: the two n 2,000 cells; 7aa had -9.6% and -6.0%)
      keep >= 85% of their summed tau 0 gain (1 - ratio) at tau 0.1.
  P4  at tau 0.2 they keep under 85%: a mid-informative coder is where tau 0.2 starts to cost, so 0.1, not 0.2.
  P5  1.5B fear, n 2,000: tau 0.3 with guard 0 is at least 0.03 narrower (ratio) than the shipped default (tau 0.3,
      guard 20), so the shipped screen's cost there is guard 20, not tau 0.3.
  Decision rule, fixed now: if P2 holds, tau 0.1 keeps >= 85% of the 0.5B gain and, in the other 0.5B cells
  (n 500, where 7aa found the cells design 2 to 3% wider), tau 0.1's ratio is at most 0.02 above max(tau 0 ratio, 1),
  the library default changes to TAU 0.1, GUARD 0 in this PR (7ah's informative and useless-coder sides already
  passed at tau 0.1); otherwise it stays TAU 0.3, GUARD 20 and the summary says which bar failed.
  Refuted: P1 if any row misses; P2 if any row is under 93%; P3 to P5 if their inequality fails.
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
import h7ah_tau as H  # noqa: E402

TAUS = (0.0, 0.1, 0.2, 0.3)
RULES = ([("pooled", 2.0, 0, 0)] + [(f"tau={t}", t, 0, A.NEG_GUARD) for t in TAUS]
         + [("shipped", A.TAU, A.GUARD, A.NEG_GUARD)])
CELLS = [("Qwen2.5-0.5B-Instruct", ("fear", "sadness")),
         ("Qwen2.5-1.5B-Instruct", ("fear", "sadness", "admiration"))]
OUT = HERE / "h7ai_weak_llm_tau_draws.txt"


def cells():
    import group_shift_reddit as R
    import h6r_rare_pilot as P
    for model, cats in CELLS:
        for cat in cats:
            rows = P.load(cat)
            rng = random.Random(R.SPLIT_SEED); order = list(range(len(rows))); rng.shuffle(order)
            cut = int(R.TRAIN_SHARE * len(rows))
            train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
            h, N = [t[2] for t in test], len(test)
            sc = {}
            for line in (HERE / f"gollm_{cat}_{model}.tsv").read_text().splitlines():
                i, x = line.split("\t"); sc[int(i)] = float(x)
            sc = [sc[i] for i in range(N)]
            prev_tr = sum(t[2] for t in train) / len(train)
            thr = sorted(sc)[int(N * (1 - min(0.5, 3 * prev_tr)))]
            f = [int(x > thr) for x in sc]
            tp = sum(1 for a, b in zip(h, f) if a and b); fn = sum(h) - tp; fp = sum(f) - tp
            for n in H.GO_NS:
                yield dict(label=f"{model.split('-')[1]} {cat}", n=n, pilot=n // 2, h=h,
                           f=f, tp=tp, fn=fn, fp=fp, J=A.informedness(h, f), seed=H.GO_SEED)


def forecasts(c):
    N = len(c["h"])
    return [100 * A.cells_probability(c["pilot"], c["tp"], c["fn"], c["fp"], N, tau=t) for t in TAUS]


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
            fc = f"{q[k - 1]:.1f}" if 1 <= k <= len(TAUS) else "-"
            line = (f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {fc} | {100 * sum(x[2] for x in r) / reps:.1f}"
                    f" | {100 * sum(x[1] for x in r) / reps:.1f} | {100 * w:.3f} | {w / wp:.3f}")
            out.append(line); print(line, flush=True)
        OUT.write_text("\n".join(out) + "\n")


def summary():
    rows = []
    for line in OUT.read_text().splitlines()[1:]:
        cell, n, J, rule, fc, obs, cov, hw, ratio = [x.strip() for x in line.split("|")]
        rows.append(dict(cell=cell, n=int(n), J=float(J), rule=rule, fc=fc, obs=float(obs), cov=float(cov),
                         ratio=float(ratio), weak=cell.startswith("0.5B")))
    by = {(r["cell"], r["n"], r["rule"]): r for r in rows}
    keys = sorted({(r["cell"], r["n"]) for r in rows})
    out = []
    p1 = [(r, abs(float(r["fc"]) - r["obs"])) for r in rows if r["fc"] != "-"]
    def tol(q, reps=1000):
        return max(5.0, 300 * ((q / 100) * (1 - q / 100) / reps) ** 0.5)
    miss = [(r["cell"], r["n"], r["rule"], round(d, 1)) for r, d in p1 if d > tol(float(r["fc"]))]
    out.append(f"P1 forecast within max(5 points, 3 SE): {len(p1) - len(miss)} of {len(p1)}; misses {miss}; "
               f"largest gap {max(d for _, d in p1):.1f}")
    low = [(r["cell"], r["n"], r["rule"], r["cov"]) for r in rows if r["cov"] < 93.0]
    out.append(f"P2 coverage >= 93% in every cell and rule: {'yes' if not low else 'no ' + str(low)}")
    weak = [k for k in keys if k[0].startswith("0.5B")]
    for k in weak:
        out.append(f"{k[0]} n {k[1]}: " + ", ".join(f"{rule} {by[(k[0], k[1], rule)]['ratio']:.3f} "
                                                   f"({by[(k[0], k[1], rule)]['obs']:.0f}% cells)"
                                                   for rule in [r[0] for r in RULES[1:]]))
    gain_cells = [k for k in weak if by[(k[0], k[1], "tau=0.0")]["ratio"] < 0.97]
    g = {t: sum(1 - by[(k[0], k[1], f"tau={t}")]["ratio"] for k in gain_cells) for t in TAUS}
    keep = {}
    for t in TAUS[1:]:
        keep[t] = g[t] / g[0.0] if g[0.0] > 0 else float("nan")
        out.append(f"tau={t}: 0.5B cells with tau-0 ratio < 0.97 ({len(gain_cells)}) keep {100 * keep[t]:.0f}% "
                   f"of the tau 0 gain")
    small = [k for k in weak if k not in gain_cells]
    excess = max((by[(k[0], k[1], "tau=0.1")]["ratio"] - max(by[(k[0], k[1], "tau=0.0")]["ratio"], 1.0)
                  for k in small), default=0.0)
    out.append(f"tau=0.1 in the other 0.5B cells: largest ratio above max(tau 0 ratio, 1) {excess:+.3f}")
    out.append(f"P3 tau 0.1 keeps >= 85%: {'yes' if keep[0.1] >= 0.85 else 'no'}")
    out.append(f"P4 tau 0.2 keeps < 85%: {'yes' if keep[0.2] < 0.85 else 'no'}")
    ship = [(k, by[(k[0], k[1], 'shipped')]['ratio'], by[(k[0], k[1], 'tau=0.3')]['ratio'],
             by[(k[0], k[1], 'tau=0.1')]['ratio']) for k in keys]
    for k, s, t3, t1 in ship:
        out.append(f"{k[0]} n {k[1]}: shipped {s:.3f}, tau 0.3 guard 0 {t3:.3f}, tau 0.1 guard 0 {t1:.3f}")
    f2 = by[("1.5B fear", 2000, "tau=0.3")]["ratio"], by[("1.5B fear", 2000, "shipped")]["ratio"]
    out.append(f"P5 1.5B fear n 2000: tau 0.3 guard 0 {f2[0]:.3f} vs shipped {f2[1]:.3f}: "
               f"{'yes' if f2[0] <= f2[1] - 0.03 else 'no'}")
    ok = not low and keep[0.1] >= 0.85 and excess <= 0.02
    out.append(f"Decision rule: {'change the library default to TAU 0.1, GUARD 0' if ok else 'keep TAU 0.3, GUARD 20'}")
    text = "\n".join(out); print(text); (HERE / "h7ai_weak_llm_tau.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "forecast"
    if mode == "forecast":
        print("cell | n | corpus | J | pilot | " + " | ".join(f"forecast % tau {t}" for t in TAUS))
        for c in cells():
            print(f"{c['label']} | {c['n']} | {len(c['h'])} | {c['J']:.3f} | {c['pilot']} | "
                  + " | ".join(f"{x:.1f}" for x in forecasts(c)), flush=True)
    elif mode == "summary":
        summary()
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
