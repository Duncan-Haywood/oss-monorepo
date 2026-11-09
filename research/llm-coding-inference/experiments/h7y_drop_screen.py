"""Milestone 7y: does the library's shipped default (audit_design, neg_guard = 3) hold with a real zero-shot LLM coder
(Qwen2.5-1.5B-Instruct scores cached by llm_code_goemotions.py) on GoEmotions categories at 1 to 5% prevalence?
Corpus = the whole 70% test part (about 6,680 items, natural prevalence); coder = LLM score above a label-free cut so that
coder-positives are 3x the train prevalence (as h6ab); n = 1000, pilot 500, fitted lambda, 500 draws.
Rules: pooled; old default (tau 0.3, guard 20, neg_guard 0); shipped default (neg_guard = 3); neg_guard=3 alone.
Args: category reps n (pilot = n/2). 7y: does dropping the tau/guard screen hold across audit sizes? Writes h7x_<category>.txt.   python3 experiments/h7x_llm_coder.py fear 500
"""
import random, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CAT, REPS, N = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
sys.argv = sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
import group_shift_reddit as R  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402
import h7l_fixed_lambda as L  # noqa: E402
from llmci import audit_design as A  # noqa: E402

import os
SEED, MODEL = 20261107, os.environ.get("LLM", "Qwen2.5-1.5B-Instruct")  # 7aa: LLM=Qwen2.5-0.5B-Instruct for a second LLM
SUF = "" if MODEL == "Qwen2.5-1.5B-Instruct" else "_" + MODEL.split("-")[1]
RULES = (("pooled", 2.0, 0, 0), ("shipped default (neg_guard 3)", A.TAU, A.GUARD, A.NEG_GUARD), ("neg_guard=3 alone", 0.0, 0, A.NEG_GUARD))


def main():
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
    f = [int(x > thr) for x in sc]
    truth = sum(human) / n
    tp = sum(1 for a, b in zip(human, f) if a and b); fn = sum(human) - tp; fp = sum(f) - tp; tn = n - tp - fn - fp
    J = tp / (tp + fn) + tn / (tn + fp) - 1
    out = [f"GoEmotions {CAT}, LLM {MODEL}, corpus {n}, prevalence {truth:.4f}, coder J {J:.3f} (sens {tp/(tp+fn):.3f}, spec {tn/(tn+fp):.3f}), n {N}, {REPS} draws",
           "rule | share of draws using cells % | coverage % | half-width pts"]
    rr = random.Random(SEED + 5)
    draws = [rr.sample(range(n), N // 2) for _ in range(REPS)]
    sb = [random.Random(SEED + 7 * d) for d in range(REPS)]
    for name, tau, guard, ng in RULES:
        cov = nc = 0; hw = 0.0
        for d, pilot in enumerate(draws):
            labels = {i: human[i] for i in pilot}
            plan = A.plan_audit(f, labels, N, tau=tau, guard=guard, neg_guard=ng)
            nc += plan["design"] == "cells"
            for cell, t in zip(plan["cells"], plan["to_label"]):
                for i in sb[d].sample([i for i in cell if i not in labels], t): labels[i] = human[i]
            lo, hi = L.interval(plan, f, labels, "fit")
            hw += (hi - lo) / 2; cov += lo <= truth <= hi
        line = f"{name} | {100*nc/REPS:.0f} | {100*cov/REPS:.1f} | {100*hw/REPS:.3f}"
        out.append(line); print(line, flush=True)
    print(out[0]); (HERE / f"h7y_{CAT}_n{N}{SUF}.txt").write_text("\n".join(out) + "\n")


main()
