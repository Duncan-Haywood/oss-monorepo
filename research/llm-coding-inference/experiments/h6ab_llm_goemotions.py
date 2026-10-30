"""Milestone 6ab: does a real zero-shot LLM coder (Qwen2.5-1.5B-Instruct, cached by llm_code_goemotions.py) make PPI pay at a rare
category on GoEmotions? Per category (fear, sadness) and coder (NB as in 6r..6aa; LLM with the fixed cut score > 0; LLM with a
label-free cut so that coder-positives are 3x the train prevalence): sensitivity, specificity, oracle stratified lambda, and the
oracle Neyman audit size for 1.0 and 0.5 point half-widths with the tuned coder (lambda) against human-only (lambda = 0); then a
fixed-size audit simulation (n = 400, 1000; tuned stratified PPI and stratified human-only; coverage and mean half-width).
Writes h6ab_llm_goemotions.txt.

    python3 experiments/h6ab_llm_goemotions.py [reps]    # needs numpy-free stdlib only + the cached gollm_*.tsv; a few minutes
"""
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift_reddit as R  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
SEED, MODEL = 20261103, "Qwen2.5-1.5B-Instruct"
GROUPS, SIZES_N = P.GROUPS, (400, 1000)


def scores(cat, n):
    d = {}
    for l in (HERE / f"gollm_{cat}_{MODEL}.tsv").read_text().splitlines():
        i, x = l.split("\t")
        d[int(i)] = float(x)
    assert len(d) == n, (len(d), n)
    return [d[i] for i in range(n)]


def audit_sim(sets, f, human, sizes, truth, n, mode, rr):
    alloc = P.allocate(n, sizes, [max(1e-4, E.stratum_lambda_s2([human[i] for i in sets[g]], [f[i] for i in sets[g]])[1]) for g in GROUPS],
                       sizes)
    strata = []
    for k, a in zip(GROUPS, alloc):
        idx = rr.sample(sets[k], a)
        strata.append((len(sets[k]), [f[i] for i in sets[k]], [human[i] for i in idx], [f[i] for i in idx]))
    e = E.stratified_ppi_tuned(strata, 0.0 if mode == "human" else None)
    return E.Z95 * e.se, E.covers(e, truth)


def main():
    out = []
    for cat in P.CATS:
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED)
        order = list(range(len(rows)))
        rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
        human, n = [t[2] for t in test], len(test)
        prev_tr = sum(t[2] for t in train) / len(train)
        sc = scores(cat, n)
        srt = sorted(sc)
        thr = srt[int(n * (1 - min(0.5, 3 * prev_tr)))]
        coders = {"NB (3x cut)": P.coder(train, test), "LLM score>0": [int(x > 0) for x in sc], "LLM 3x cut": [int(x > thr) for x in sc]}
        sets = {g: [i for i in range(n) if test[i][1] == g] for g in GROUPS}
        sizes = [len(sets[g]) for g in GROUPS]
        truth = sum(human) / n
        out.append(f"{cat}: corpus {n}, prevalence {truth:.4f}, positives {sum(human)}, strata {sizes}; LLM = {MODEL}, one zero-shot yes/no prompt")
        out.append("coder | coder-positive share | sens | spec | pooled lambda | oracle n 1.0pt human-only / tuned | oracle n 0.5pt human-only / tuned")
        for name, f in coders.items():
            tp = sum(h and c for h, c in zip(human, f)); pos = sum(human)
            fp = sum((not h) and c for h, c in zip(human, f))
            lam = E._cov(human, f) / E._var(f) if E._var(f) else 0
            row = f"{name} | {sum(f) / n:.3f} | {tp / pos:.3f} | {1 - fp / (n - pos):.3f} | {max(0, min(1, lam)):.2f}"
            for tgt in P.TARGETS:
                s2h = [E._var([human[i] for i in sets[g]]) for g in GROUPS]
                s2t = [E.stratum_lambda_s2([human[i] for i in sets[g]], [f[i] for i in sets[g]])[1] for g in GROUPS]
                row += f" | {math.ceil(E.neyman_total(sizes, s2h, tgt))} / {math.ceil(E.neyman_total(sizes, s2t, tgt))}"
            out.append(row)
        out.append("")
        out.append(f"fixed-size audits, {REPS} draws: coder | n | rule | coverage % | mean half-width pts")
        for name, f in coders.items():
            for na in SIZES_N:
                for mode in ("human", "tuned"):
                    rr = random.Random(SEED)
                    r = [audit_sim(sets, f, human, sizes, truth, na, mode, rr) for _ in range(REPS)]
                    out.append(f"{name} | {na} | {'stratified human-only' if mode == 'human' else 'tuned stratified PPI'} | "
                               f"{100 * sum(x[1] for x in r) / REPS:.1f} | {100 * sum(x[0] for x in r) / REPS:.3f}")
        out.append("")
        print("\n".join(out[-30:]), flush=True)
    (HERE / "h6ab_llm_goemotions.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
