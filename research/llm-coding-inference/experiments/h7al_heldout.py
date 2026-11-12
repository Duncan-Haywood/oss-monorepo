"""Milestone 7al: does the shipped three-part rule (screen tau 0.1, neg_guard 3, width forecast WIDTH_MARGIN 0) hold
on GoEmotions categories no rule has been tuned or checked on? (7ak's next step: "a fresh pre-registered check of the
new default on cells no rule has seen".)

7ak made WIDTH_MARGIN 0 the default after checking it on the same 27 cells whose costs motivated it. This milestone
codes four new categories with the same zero-shot Qwen2.5-1.5B-Instruct coder (`llm_code_goemotions.py`, one yes/no
question per category, written into its QUESTION table before any score existed) and runs 7ak's draw loop unchanged.

Categories, chosen by prevalence only (1 to 6% band, test part of the 6r split, N = 6,683), before any of their LLM
scores existed: gratitude 5.12%, curiosity 3.74%, disapproval 2.78%, anger 2.30%. No category here appears in any
earlier 7-series cell (those were fear, sadness, admiration, neutral, and NaijaSenti negative). Threshold, split, pilot
(n/2), seeds (GO_SEED) and audit sizes (500, 1,000, 2,000) are 7ak's goemo settings. Rules (7ak's RULES): pooled;
"default" = screen only (width_margin None, the rule before 7ak); "m=0" = the shipped default; "m=0.02". 1,000 draws
per cell (+/- 1.4 points on coverage). If a category's scoring does not finish in this session it is reported as not
run, not replaced.

    python3 experiments/h7al_heldout.py forecast      # J and the oracle predicted_ratio per cell, no draws
    python3 experiments/h7al_heldout.py draws [reps]  # -> h7al_heldout_draws.txt
    python3 experiments/h7al_heldout.py summary       # -> h7al_heldout.txt

Prediction (written and committed before any held-out score or draw existed):
  P1  every rule covers 93% or more in every cell.
  P2  the shipped default (m=0) has a ratio to pooled <= 1.010 in every cell (7ak's headline: never more than 0.3%
      wider than pooled in 27 cells). This is the claim under test; refuted if any cell is above 1.010.
  P3  m=0 keeps >= 90% of the screen-only rule's gain (sum of 1 - ratio over cells whose screen-only ratio < 0.97).
      If no cell has a screen-only ratio under 0.97, P3 is reported as untestable, not as supported.
  P4  where m=0 is under 0.97, the oracle predicted_ratio (whole corpus as the pilot) is under 1 (an observation on
      the forecast, not a decision input).
  Guesses, not tests: gratitude has the highest J (an explicit "thanks" is easy for a 1.5B model) and gains most;
      disapproval and anger have J under 0.3 and sit at about pooled.
  Decision rule, fixed now: if P1 and P2 hold, WIDTH_MARGIN 0 stays the default and the paper may say it held on
  held-out categories; if P2 fails, the default is not changed in this PR, the failing cells are reported, and the
  paper's claim is narrowed to the cells it was checked on.
"""
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
import h7ak_width_forecast as K  # noqa: E402

CATS = ("gratitude", "curiosity", "disapproval", "anger")
MODEL = "Qwen2.5-1.5B-Instruct"
NS = (500, 1000, 2000)
OUT = HERE / "h7al_heldout_draws.txt"


def cells():
    import random
    import group_shift_reddit as R
    import h6r_rare_pilot as P
    import h7ah_tau as H
    for cat in CATS:
        path = HERE / f"gollm_{cat}_{MODEL}.tsv"
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED); order = list(range(len(rows))); rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
        h, N = [t[2] for t in test], len(test)
        sc = {}
        if path.exists():
            for line in path.read_text().splitlines():
                i, x = line.split("\t"); sc[int(i)] = float(x)
        if len(sc) < N:
            print(f"{cat}: {len(sc)} of {N} items scored; not run", file=sys.stderr)
            continue
        sc = [sc[i] for i in range(N)]
        prev_tr = sum(t[2] for t in train) / len(train)
        thr = sorted(sc)[int(N * (1 - min(0.5, 3 * prev_tr)))]
        f = [int(x > thr) for x in sc]
        for n in NS:
            yield dict(part="goemo", label=f"1.5B {cat}", n=n, pilot=n // 2, h=h, f=f,
                       J=A.informedness(h, f), seed=H.GO_SEED, prev=sum(h) / N)


def draws(reps):
    cs = list(cells())
    with Pool(4) as p:
        got = p.map(K.one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([K.HEAD] + [l for g in got for l in g]) + "\n")


def summary():
    rows = []
    for line in OUT.read_text().splitlines()[1:]:
        cell, n, J, rule, obs, cov, hw, ratio, mp = [x.strip() for x in line.split("|")]
        rows.append(dict(cell=cell, n=int(n), J=float(J), rule=rule, obs=float(obs), cov=float(cov),
                         hw=float(hw), ratio=float(ratio), mp=mp))
    by = {(r["cell"], r["n"], r["rule"]): r for r in rows}
    keys = sorted({(r["cell"], r["n"]) for r in rows})
    orc = {(c["label"], c["n"]): K.oracle(c) for c in cells()}
    out = [f"cells run: {len(keys)} ({len({k[0] for k in keys})} categories of {len(CATS)} planned)"]
    for k in keys:
        out.append(f"{k[0]} n {k[1]} (J {by[(*k, 'pooled')]['J']:.3f}): oracle {orc[k]:.3f}; pooled half-width "
                   f"{by[(*k, 'pooled')]['hw']:.3f} pts, cov {by[(*k, 'pooled')]['cov']:.1f}; " + ", ".join(
                       f"{name} {by[(*k, name)]['ratio']:.3f} ({by[(*k, name)]['obs']:.0f}% cells, cov "
                       f"{by[(*k, name)]['cov']:.1f})" for name, *_r in K.RULES[1:]))
    low = [(r["cell"], r["n"], r["rule"], r["cov"]) for r in rows if r["cov"] < 93.0]
    out.append(f"P1 coverage >= 93% in every cell and rule: {'yes' if not low else 'no ' + str(low)}")
    worst = max(by[(*k, 'm=0')]["ratio"] for k in keys)
    over = [(k, by[(*k, 'm=0')]["ratio"]) for k in keys if by[(*k, 'm=0')]["ratio"] > 1.010]
    out.append(f"P2 m=0 ratio <= 1.010 in every cell: {'yes' if not over else 'no ' + str(over)} (worst {worst:.3f})")
    gain = [k for k in keys if by[(*k, 'default')]["ratio"] < 0.97]
    if gain:
        g0 = sum(1 - by[(*k, 'default')]["ratio"] for k in gain)
        keep = sum(1 - by[(*k, 'm=0')]["ratio"] for k in gain) / g0
        out.append(f"P3 m=0 keeps >= 90% of the screen-only gain over {len(gain)} cells: "
                   f"{'yes' if keep >= 0.90 else 'no'} ({100 * keep:.0f}%)")
    else:
        out.append("P3 untestable: no cell has a screen-only ratio under 0.97")
    g = [k for k in keys if by[(*k, 'm=0')]["ratio"] < 0.97]
    miss = [k for k in g if orc[k] >= 1.0]
    out.append(f"P4 (observation) oracle < 1 where m=0 < 0.97 ({len(g)} cells): {'yes' if not miss else 'no ' + str(miss)}")
    ok = not low and not over
    out.append("Decision rule: " + ("WIDTH_MARGIN 0 stays the default; held on held-out categories" if ok else
                                    "default not changed here; claim narrowed to the cells it was checked on"))
    text = "\n".join(out); print(text); (HERE / "h7al_heldout.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "forecast"
    if mode == "forecast":
        print("cell | n | prevalence % | J | oracle predicted_ratio")
        for c in cells():
            print(f"{c['label']} | {c['n']} | {100 * c['prev']:.2f} | {c['J']:.3f} | {K.oracle(c):.3f}", flush=True)
    elif mode == "summary":
        summary()
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
