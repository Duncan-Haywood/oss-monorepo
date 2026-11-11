"""Milestone 7ah: which small positive tau keeps a near-useless coder out of the cells design without giving up the
width an informative coder buys? (7ag's next step.)

7ag found that with tau 0 (guard 0, neg_guard 3) the screen hands a J 0.03 coder the cells design in 25 to 91% of
draws and the interval comes out 2 to 14% wider than pooled, while an informative coder (J 0.39) gains 4 to 7%. Here
`audit_design.cells_probability(..., tau=t)` (extended in this milestone, tested against brute-force enumeration of
the real `screen`) forecasts the share of draws using cells for each tau, and the draws then measure width and coverage.

Cells: (A) 7ag's 12 NaijaSenti cells (negative share thinned to 2/5/10%, coders nb-in-language J 0.39 and lexicon-en
J 0.03, n 600 and 2,000, pilot 0.3 n, `audit_design.audit_interval`), same seeds as 7ag so the tau 0 rows replay it;
(B) GoEmotions fear, sadness, admiration with the cached Qwen2.5-1.5B zero-shot scores (J 0.46, 0.62, 0.65), n 500
and 2,000, pilot n/2, 7y's pipeline and seeds (fitted-lambda interval of h7l). Rules: pooled; tau in
{0, 0.05, 0.1, 0.2}, guard 0, neg_guard 3. 1,000 draws per cell (+/- 1.4 points on coverage).

    python3 experiments/h7ah_tau.py forecast        # forecasts only, no draws (run first; pasted below)
    python3 experiments/h7ah_tau.py naija [reps]    # part A draws -> h7ah_tau_naija.txt
    python3 experiments/h7ah_tau.py goemo [reps]    # part B draws -> h7ah_tau_goemo.txt
    python3 experiments/h7ah_tau.py summary         # reads both files, applies the decision rule -> h7ah_tau.txt

Forecasts (from `forecast`, before any draw ran; exact `cells_probability`, % of draws using coder cells):
  cell | n | corpus | J | pilot | forecast % tau 0.0 | forecast % tau 0.05 | forecast % tau 0.1 | forecast % tau 0.2
  nb-in-language 0.02 | 600 | 30480 | 0.397 | 180 | 16.8 | 15.1 | 12.4 | 9.4
  nb-in-language 0.02 | 2000 | 30480 | 0.397 | 600 | 88.3 | 87.6 | 86.3 | 79.6
  nb-in-language 0.05 | 600 | 31442 | 0.394 | 180 | 73.0 | 71.6 | 69.5 | 61.6
  nb-in-language 0.05 | 2000 | 31442 | 0.394 | 600 | 100.0 | 100.0 | 99.9 | 98.1
  nb-in-language 0.1 | 600 | 33189 | 0.398 | 180 | 98.3 | 98.1 | 97.5 | 92.8
  nb-in-language 0.1 | 2000 | 33189 | 0.398 | 600 | 100.0 | 100.0 | 100.0 | 99.8
  lexicon-en 0.02 | 600 | 30480 | 0.030 | 180 | 23.8 | 8.6 | 8.4 | 3.1
  lexicon-en 0.02 | 2000 | 30480 | 0.030 | 600 | 37.3 | 34.3 | 12.0 | 1.3
  lexicon-en 0.05 | 600 | 31442 | 0.027 | 180 | 46.2 | 26.6 | 14.9 | 2.0
  lexicon-en 0.05 | 2000 | 31442 | 0.027 | 600 | 65.8 | 24.0 | 3.4 | 0.0
  lexicon-en 0.1 | 600 | 33189 | 0.030 | 180 | 64.0 | 30.8 | 8.7 | 0.4
  lexicon-en 0.1 | 2000 | 33189 | 0.030 | 600 | 89.7 | 20.4 | 0.9 | 0.0
  goemotions fear | 500 | 6683 | 0.461 | 250 | 14.2 | 14.1 | 14.1 | 12.0
  goemotions fear | 2000 | 6683 | 0.461 | 1000 | 94.9 | 94.9 | 94.5 | 91.8
  goemotions sadness | 500 | 6683 | 0.623 | 250 | 27.2 | 27.2 | 27.1 | 25.4
  goemotions sadness | 2000 | 6683 | 0.623 | 1000 | 98.4 | 98.4 | 98.4 | 98.4
  goemotions admiration | 500 | 6683 | 0.649 | 250 | 62.2 | 62.2 | 62.2 | 62.2
  goemotions admiration | 2000 | 6683 | 0.649 | 1000 | 100.0 | 100.0 | 100.0 | 100.0
  The tau 0 column replays 7ag's forecasts and matches 7ae's observed GoEmotions shares (fear 13 to 14%, sadness 28%,
  admiration 60 to 64% at n 500). tau 0.1 cuts the lexicon's share to 1 to 15%; the informative coders lose at most
  4 points of share there (nb-in-language 2%, n 600: 16.8 to 12.4).

Prediction (written before the draws):
  P1  |forecast - observed share| <= max(5 points, 3 binomial SEs at 1,000 draws) in all 72 (cell, tau) rows.
  P2  every tau rule covers 93% or more in all 18 cells.
  P3  at tau 0.1 the worst lexicon width ratio (rule / pooled) is <= 1.04 (it is 1.135 at tau 0, 7ag), and the
      informative cells whose tau 0 ratio is under 0.97 keep >= 85% of their summed tau 0 gain (1 - ratio).
  P4  tau 0.05 leaves a lexicon cell above 1.04 (shares still 20 to 34% at n 2,000 and 600).
  Decision rule, fixed now: the recommended tau is the smallest grid value with worst lexicon ratio <= 1.04, gain kept
  >= 85% and P2 met; if none qualifies, keep tau 0 and say so. The library default (TAU 0.3, GUARD 20) is not changed
  in this milestone either way; a recommendation needs a second corpus for the weak-coder side.
  Refuted: P1 if any row misses; P2 if any row is under 93%; P3 or P4 if their inequality fails.
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402

TAUS = (0.0, 0.05, 0.1, 0.2)
RULES = [("pooled", 2.0, 0, 0)] + [(f"tau={t}", t, 0, A.NEG_GUARD) for t in TAUS]
GO_CATS, GO_NS, GO_SEED = ("fear", "sadness", "admiration"), (500, 2000), 20261107


def naija_cells():
    import h7ag_fresh_forecast as G
    for cname, prev, h, f in G.corpora():
        tp, fn, fp = G.counts(h, f)
        for n in G.NS:
            yield dict(part="naija", label=f"{cname} {prev}", n=n, pilot=round(A.PILOT_SHARE * n), h=h, f=f,
                       tp=tp, fn=fn, fp=fp, J=A.informedness(h, f), seed=G.SEED + n + int(1000 * prev))


def goemo_cells():
    import group_shift_reddit as R
    import h6r_rare_pilot as P
    for cat in GO_CATS:
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED); order = list(range(len(rows))); rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
        h, N = [t[2] for t in test], len(test)
        sc = {}
        for line in (HERE / f"gollm_{cat}_Qwen2.5-1.5B-Instruct.tsv").read_text().splitlines():
            i, x = line.split("\t"); sc[int(i)] = float(x)
        sc = [sc[i] for i in range(N)]
        prev_tr = sum(t[2] for t in train) / len(train)
        thr = sorted(sc)[int(N * (1 - min(0.5, 3 * prev_tr)))]
        f = [int(x > thr) for x in sc]
        tp = sum(1 for a, b in zip(h, f) if a and b); fn = sum(h) - tp; fp = sum(f) - tp
        for n in GO_NS:
            yield dict(part="goemo", label=f"goemotions {cat}", n=n, pilot=n // 2, h=h, f=f, tp=tp, fn=fn, fp=fp,
                       J=A.informedness(h, f), seed=GO_SEED)


def forecasts(c):
    N = len(c["h"])
    return [100 * A.cells_probability(c["pilot"], c["tp"], c["fn"], c["fp"], N, tau=t) for t in TAUS]


def run_naija(c, reps):
    import h7ag_fresh_forecast as G
    N, truth = len(c["h"]), sum(c["h"]) / len(c["h"])
    res = {}
    for name, tau, g, ng in RULES:
        rr = random.Random(c["seed"])
        res[name] = [G.one(c["f"], c["h"], c["n"], truth, rr, tau, g, ng) for _ in range(reps)]
    return res


def run_goemo(c, reps):
    import h7l_fixed_lambda as L
    h, f, n_aud = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    rr = random.Random(c["seed"] + 5)
    draws = [rr.sample(range(N), n_aud // 2) for _ in range(reps)]
    res = {}
    for name, tau, g, ng in RULES:
        out = []
        for d, pilot in enumerate(draws):
            sb = random.Random(c["seed"] + 7 * d)
            labels = {i: h[i] for i in pilot}
            plan = A.plan_audit(f, labels, n_aud, tau=tau, guard=g, neg_guard=ng)
            for cell, t in zip(plan["cells"], plan["to_label"]):
                for i in sb.sample([i for i in cell if i not in labels], t):
                    labels[i] = h[i]
            lo, hi = L.interval(plan, f, labels, "fit")
            out.append(((hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells"))
        res[name] = out
    return res


HEAD = ("cell | n | J | rule | forecast cells % | observed cells % | coverage % | half-width pts | ratio to pooled")


def draws(part, reps):
    cells = naija_cells() if part == "naija" else goemo_cells()
    run = run_naija if part == "naija" else run_goemo
    out = [HEAD]
    for c in cells:
        q = forecasts(c)
        res = run(c, reps)
        wp = sum(x[0] for x in res["pooled"]) / reps
        for k, (name, *_r) in enumerate(RULES):
            r = res[name]
            w = sum(x[0] for x in r) / reps
            fc = "-" if k == 0 else f"{q[k - 1]:.1f}"
            line = (f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {fc} | {100 * sum(x[2] for x in r) / reps:.1f} | "
                    f"{100 * sum(x[1] for x in r) / reps:.1f} | {100 * w:.3f} | {w / wp:.3f}")
            out.append(line); print(line, flush=True)
    (HERE / f"h7ah_tau_{part}.txt").write_text("\n".join(out) + "\n")


def summary():
    rows = []
    for part in ("naija", "goemo"):
        for line in (HERE / f"h7ah_tau_{part}.txt").read_text().splitlines()[1:]:
            cell, n, J, rule, fc, obs, cov, hw, ratio = [x.strip() for x in line.split("|")]
            rows.append(dict(cell=cell, n=int(n), J=float(J), rule=rule, fc=fc, obs=float(obs), cov=float(cov),
                             ratio=float(ratio), weak=cell.startswith("lexicon")))
    out = []
    by = {(r["cell"], r["n"], r["rule"]): r for r in rows}
    keys = sorted({(r["cell"], r["n"]) for r in rows})
    p1 = [(r, abs(float(r["fc"]) - r["obs"])) for r in rows if r["fc"] != "-"]
    def tol(q, reps=1000):
        return max(5.0, 300 * ((q / 100) * (1 - q / 100) / reps) ** 0.5)
    miss = [(r["cell"], r["n"], r["rule"], round(d, 1)) for r, d in p1 if d > tol(float(r["fc"]))]
    out.append(f"P1 forecast within max(5 points, 3 SE): {len(p1) - len(miss)} of {len(p1)}; misses {miss}; "
               f"largest gap {max(d for _, d in p1):.1f}")
    low = [(r["cell"], r["n"], r["rule"], r["cov"]) for r in rows if r["cov"] < 93.0]
    out.append(f"P2 coverage >= 93% in every cell and rule: {'yes' if not low else 'no ' + str(low)}")
    base = {k: by[(k[0], k[1], "tau=0.0")]["ratio"] for k in keys}
    gain_cells = [k for k in keys if not k[0].startswith("lexicon") and base[k] < 0.97]
    chosen = None
    for t in TAUS[1:]:
        rule = f"tau={t}"
        worst = max(by[(k[0], k[1], rule)]["ratio"] for k in keys if k[0].startswith("lexicon"))
        g0 = sum(1 - base[k] for k in gain_cells)
        gt = sum(1 - by[(k[0], k[1], rule)]["ratio"] for k in gain_cells)
        out.append(f"{rule}: worst lexicon ratio {worst:.3f}; informative cells keep {100 * gt / g0:.0f}% of the tau 0 "
                   f"gain ({len(gain_cells)} cells with tau-0 ratio < 0.97)")
        if chosen is None and worst <= 1.04 and gt >= 0.85 * g0 and not low:
            chosen = t
    out.append(f"Decision rule: recommended tau = {chosen if chosen is not None else 'none qualifies, keep tau 0'}")
    text = "\n".join(out); print(text); (HERE / "h7ah_tau.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "forecast"
    if mode == "forecast":
        print("cell | n | corpus | J | pilot | " + " | ".join(f"forecast % tau {t}" for t in TAUS))
        for gen in (naija_cells, goemo_cells):
            for c in gen():
                print(f"{c['label']} | {c['n']} | {len(c['h'])} | {c['J']:.3f} | {c['pilot']} | "
                      + " | ".join(f"{x:.1f}" for x in forecasts(c)), flush=True)
    elif mode == "summary":
        summary()
    else:
        draws(mode, int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
