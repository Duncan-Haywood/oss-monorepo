"""Milestone 7ae: is the guard-only rule's width gain over pooled driven by the audit size n or by the audit's share of
the corpus n/N? 7ad found the gain only at n/N near 0.30, but there n = 2,000 every time, so the two were confounded.

Design: GoEmotions test part (6,683 items), cached Qwen2.5-1.5B-Instruct zero-shot scores, the 7x/7y label-free cut
(computed once on the whole test part, so the coder is the same rule in every cell). For each draw a corpus of N items is
subsampled uniformly without replacement from the test part (fresh per draw; truth = that corpus's prevalence), then a
pilot of n/2 and the rest of the audit as in 7y. Rules: pooled; neg_guard=3 alone (no tau/guard-20 screen).
Cells (n, N): (500, 6683) n/N 0.075; (500, 3341) 0.15; (500, 1667) 0.30; (1000, 3341) 0.30; (2000, 6683) 0.30.

Prediction (written before any run of this script):
  P1  neg_guard=3 alone covers 93% or more in all 15 cells (3 categories x 5 cells).
  P2  share, not size, drives the gain for the two categories with more corpus positives (sadness 2.3%, admiration 8.1%):
      at n/N = 0.30 the width ratio (guard-only / pooled) at n = 500 is within 0.08 of the ratio at n = 2,000, and it
      is at least 0.08 below the ratio at (500, 6683).
  P3  for fear (1.15%; about 19 positives in a 1,667-item corpus) the guard falls back to pooled in most draws at n = 500,
      so the (500, 1667) ratio stays above 0.95 even though n/N = 0.30.
  Refuted: P1 if any cell is under 93%; P2 if either category's (500, 1667) ratio is more than 0.08 from its (2000, 6683)
  ratio; P3 if fear's (500, 1667) ratio is 0.95 or lower.

    python3 experiments/h7ae_n_vs_share.py <category> <reps>     # writes h7ae_<category>.txt
"""
import random, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CAT, REPS = sys.argv[1], int(sys.argv[2])
sys.argv = sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
import group_shift_reddit as R  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402
import h7l_fixed_lambda as L  # noqa: E402
from llmci import audit_design as A  # noqa: E402

SEED, MODEL = 20261110, "Qwen2.5-1.5B-Instruct"
CELLS = ((500, 6683), (500, 3341), (500, 1667), (1000, 3341), (2000, 6683))
RULES = (("pooled", 2.0, 0, 0), ("neg_guard=3 alone", 0.0, 0, A.NEG_GUARD))


def coder():
    rows = P.load(CAT)
    rng = random.Random(R.SPLIT_SEED); order = list(range(len(rows))); rng.shuffle(order)
    cut = int(R.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    human, n = [t[2] for t in test], len(test)
    sc = {}
    for l in (HERE / f"gollm_{CAT}_{MODEL}.tsv").read_text().splitlines():
        i, x = l.split("\t"); sc[int(i)] = float(x)
    assert len(sc) == n
    sc = [sc[i] for i in range(n)]
    prev_tr = sum(t[2] for t in train) / len(train)
    thr = sorted(sc)[int(n * (1 - min(0.5, 3 * prev_tr)))]
    return human, [int(x > thr) for x in sc]


def main():
    human_all, f_all = coder()
    M = len(human_all)
    tp = sum(1 for a, b in zip(human_all, f_all) if a and b); pos = sum(human_all); fp = sum(f_all) - tp
    J = tp / pos + (M - pos - fp) / (M - pos) - 1
    out = [f"GoEmotions {CAT}, LLM {MODEL}, test part {M}, prevalence {pos/M:.4f}, coder J {J:.3f}, {REPS} draws per cell",
           "n | N | n/N | rule | share of draws using cells % | coverage % | half-width pts | mean corpus positives"]
    for N_audit, N in CELLS:
        N = min(N, M)
        rr = random.Random(SEED + N_audit * 7 + N)
        corpora = [rr.sample(range(M), N) for _ in range(REPS)]
        pilots = [rr.sample(range(N), N_audit // 2) for _ in range(REPS)]
        res = {}
        for name, tau, guard, ng in RULES:
            cov = nc = 0; hw = 0.0; npos = 0
            for d in range(REPS):
                sb = random.Random(SEED + 7 * d)
                human = [human_all[j] for j in corpora[d]]; f = [f_all[j] for j in corpora[d]]
                truth = sum(human) / N; npos += sum(human)
                labels = {i: human[i] for i in pilots[d]}
                plan = A.plan_audit(f, labels, N_audit, tau=tau, guard=guard, neg_guard=ng)
                nc += plan["design"] == "cells"
                for cell, t in zip(plan["cells"], plan["to_label"]):
                    for i in sb.sample([i for i in cell if i not in labels], t): labels[i] = human[i]
                lo, hi = L.interval(plan, f, labels, "fit")
                hw += (hi - lo) / 2; cov += lo <= truth <= hi
            res[name] = hw / REPS
            line = (f"{N_audit} | {N} | {N_audit/N:.3f} | {name} | {100*nc/REPS:.0f} | {100*cov/REPS:.1f} | "
                    f"{100*hw/REPS:.3f} | {npos/REPS:.1f}")
            out.append(line); print(line, flush=True)
        out.append(f"{N_audit} | {N} | {N_audit/N:.3f} | width ratio guard-only/pooled | {res['neg_guard=3 alone']/res['pooled']:.3f}")
        print(out[-1], flush=True)
    print(out[0]); (HERE / f"h7ae_{CAT}.txt").write_text("\n".join(out) + "\n")


main()
