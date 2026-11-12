"""Milestone 7w: library-level check of neg_guard=3 inside audit_design.screen (not the hand-rolled k rule of 7t), plus a 0.4% category.
Same corpus, coder and draws as 7t (h7t_goemotions.py). Rules: pooled; lib default (tau 0.3, guard 20); lib neg_guard=3 alone (tau 0, guard 0);
lib default + neg_guard=3. Writes h7w_<category>.txt.   python3 experiments/h7w_library_negguard.py embarrassment 500
Original 7t docstring: does the k = 3 negative-cell guard (7r, 7s) hold on a held-out corpus with a real, item-dependent coder?
GoEmotions parts 1-3 (Demszky et al. 2020), truth = majority of raters, coder = the repo's word-presence logistic scorer
(rare_audit.NB) trained on a seeded 30% part, threshold chosen on the train part so coder-positives are ~2x prevalence.
Corpus = 6,000 items from the 70% test part (natural prevalence). Rules as h7s: pooled, cells g10, negcell k3, k5.
Args: category reps. Writes h7t_<category>.txt.   python3 experiments/h7t_goemotions.py gratitude 500
"""
import csv, random, sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
CAT, REPS = sys.argv[1], int(sys.argv[2])
sys.argv = sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
import rare_audit as R  # noqa: E402
import h7l_fixed_lambda as L  # noqa: E402
from llmci import audit_design as A  # noqa: E402

SEED, N, CORPUS = 20261105, 1000, 6000
RULES = (("pooled", 2.0, 0, 0), ("lib default", A.TAU_6AM, A.GUARD_6AM, 0), ("lib neg_guard=3", 0.0, 0, A.NEG_GUARD), ("lib default+neg3", A.TAU_6AM, A.GUARD_6AM, A.NEG_GUARD))


def load():
    votes, texts, cnt, unclear = defaultdict(int), {}, defaultdict(int), set()
    for p in R.ensure_csvs():
        with open(p, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                i = r["id"]; texts[i] = r["text"]; cnt[i] += 1
                votes[i] += r[CAT] == "1"
                if r["example_very_unclear"] == "True": unclear.add(i)
    ids = sorted(i for i in texts if cnt[i] >= 3 and i not in unclear)
    return [(texts[i], int(votes[i] * 2 > cnt[i])) for i in ids]


def main():
    rows = load()
    rng = random.Random(R.SPLIT_SEED); order = list(range(len(rows))); rng.shuffle(order)
    cut = int(R.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    trd, ted = [R.toks(t) for t, _ in train], [R.toks(t) for t, _ in test]
    ytr = [y for _, y in train]
    nb = R.NB().fit(trd, ytr)
    ts = sorted((nb.score(d) for d in trd), reverse=True)
    thr = ts[int(2 * sum(ytr))]
    sub = random.Random(SEED).sample(range(len(test)), CORPUS)
    human = [test[i][1] for i in sub]
    f = [int(nb.score(ted[i]) > thr) for i in sub]
    truth = sum(human) / CORPUS
    tp = sum(1 for a, b in zip(human, f) if a and b); fn = sum(human) - tp; fp = sum(f) - tp; tn = CORPUS - tp - fn - fp
    J = tp / (tp + fn) + tn / (tn + fp) - 1
    out = [f"GoEmotions {CAT}, corpus {CORPUS}, prevalence {truth:.4f}, coder J {J:.3f} (sens {tp/(tp+fn):.3f}, spec {tn/(tn+fp):.3f}), n {N}, {REPS} draws",
           "rule | share of draws using cells % | coverage % | half-width pts"]
    rr = random.Random(SEED + 5)
    draws = [rr.sample(range(CORPUS), N // 2) for _ in range(REPS)]
    sb = [random.Random(SEED + 7 * d) for d in range(REPS)]
    for name, tau, guard, ng in RULES:
        cov = nc = 0; hw = 0.0
        for d, pilot in enumerate(draws):
            labels = {i: human[i] for i in pilot}
            plan = A.plan_audit(f, labels, N, tau=tau, guard=guard, neg_guard=ng, width_margin=None)
            nc += plan["design"] == "cells"
            for cell, t in zip(plan["cells"], plan["to_label"]):
                for i in sb[d].sample([i for i in cell if i not in labels], t): labels[i] = human[i]
            lo, hi = L.interval(plan, f, labels, "fit")
            hw += (hi - lo) / 2; cov += lo <= truth <= hi
        line = f"{name} | {100*nc/REPS:.0f} | {100*cov/REPS:.1f} | {100*hw/REPS:.3f}"
        out.append(line); print(line, flush=True)
    print(out[0]); (HERE / f"h7w_{CAT}.txt").write_text("\n".join(out) + "\n")


main()
