"""Milestone 6q: the lambda-aware audit-size rule (6p) on NaijaSenti with the real Qwen coders, oracle and pilot-estimated.
Corpus = the 6,000-tweet subsample of h3_llm_width.corpus() with cached Qwen scores (coder = score > 0); strata = language.
Per coder: three plans (human-only, plain PPI lambda = 1, oracle lambda) sized by `neyman_total`; then the pilot version
(400 tweets, lambda and S2 estimated per language, n from the rule, fresh audit drawn from the other tweets). Writes h6q_naija_sizing.txt.

    python3 experiments/h6q_naija_sizing.py     # needs network for the NaijaSenti files; a few minutes
"""
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import h3_llm_width as H  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS, SEED, Z = 1000, 20261028, E.Z95
TARGETS = (0.03, 0.02)
MODELS = ("Qwen2.5-0.5B-Instruct", "Qwen2.5-1.5B-Instruct", "Qwen2.5-3B-Instruct")
LANGS = ("hau", "ibo", "pcm", "yor")
PILOT = 400


def est(rr, sets, f, human, truth, alloc, kind, lam=None, exclude=()):
    strata, hs = [], []
    for k, a in zip(LANGS, alloc):
        pool = [i for i in sets[k] if i not in exclude]
        idx = rr.sample(pool, a)
        strata.append((len(sets[k]), [f[i] for i in sets[k]], [human[i] for i in idx], [f[i] for i in idx]))
        hs.append((len(sets[k]), [human[i] for i in idx]))
    e = E.stratified_human(hs) if kind == "human" else E.stratified_ppi(strata) if kind == "ppi1" else E.stratified_ppi_tuned(strata, lam)
    return Z * e.se, E.covers(e, truth)


def summarise(res):
    hw = sorted(r[0] for r in res)
    return 100 * statistics.fmean(hw), 100 * hw[int(0.95 * len(hw))], sum(r[1] for r in res) / len(res)


def allocate(n, sizes, s2):
    sw = [math.sqrt(v) * N for v, N in zip(s2, sizes)]
    return [min(N, max(2, round(n * w / sum(sw)))) for w, N in zip(sw, sizes)]


def main():
    _, test_all, idx = H.corpus()
    scores = {}
    for m in MODELS:
        scores[m] = {int(a): float(b) for a, b in (l.split("\t") for l in (HERE / f"llm_scores_{m}.tsv").read_text().splitlines())}
    idx = [i for i in idx if all(i in sc for sc in scores.values())]
    test = [test_all[i] for i in idx]
    n = len(test)
    human = [t[2] for t in test]
    truth = sum(human) / n
    sets = {k: [i for i in range(n) if test[i][0] == k] for k in LANGS}
    sizes = [len(sets[k]) for k in LANGS]
    out = [f"NaijaSenti subsample {n} tweets, true negative share {truth:.4f}; languages " + ", ".join(f"{k} {len(sets[k])}" for k in LANGS),
           f"{REPS} audit draws per cell, seed {SEED}; coder = Qwen score > 0 (zero-shot). Plans sized by neyman_total on S2 of y, y - f, y - lam* f.", "",
           "coder | per-language oracle lam | S2 human | S2 ppi1 | S2 oracle | coder agreement"]
    plans = {}
    for m in MODELS:
        f = [float(scores[m][idx[i]] > 0) for i in range(n)]
        ls, s2o, s2h, s21 = [], [], [], []
        for k in LANGS:
            ya, fa = [human[i] for i in sets[k]], [f[i] for i in sets[k]]
            lam, s2 = E.stratum_lambda_s2(ya, fa)
            ls.append(lam), s2o.append(s2), s2h.append(E._var(ya)), s21.append(E._var([a - b for a, b in zip(ya, fa)]))
        plans[m] = (f, ls, {"human": s2h, "ppi1": s21, "oracle": s2o})
        fm = lambda v: ", ".join(f"{x:.3f}" for x in v)
        agree = sum(a == b for a, b in zip(f, human)) / n
        out.append(f"{m} | {fm(ls)} | {fm(s2h)} | {fm(s21)} | {fm(s2o)} | {agree:.3f}")
        print(out[-1], flush=True)
    out += ["", "coder | target pts | plan | estimator | n | allocation | mean half | 95th pct half | coverage"]
    for m in MODELS:
        f, ls, s2s = plans[m]
        for tgt in TARGETS:
            ns = {p: math.ceil(E.neyman_total(sizes, s2, tgt)) for p, s2 in s2s.items()}
            al = {p: allocate(ns[p], sizes, s2s[p]) for p in s2s}
            for plan, kind, lam in (("human", "human", None), ("ppi1", "ppi1", None), ("oracle", "tuned", ls), ("oracle", "tuned-est", None)):
                rr = random.Random(SEED)
                res = [est(rr, sets, f, human, truth, al[plan], "tuned" if kind.startswith("tuned") else kind, lam) for _ in range(REPS)]
                a, p95, cov = summarise(res)
                out.append(f"{m} | {100 * tgt:.0f} | {plan} | {kind} | {ns[plan]} | {al[plan]} | {a:.2f} | {p95:.2f} | {cov:.3f}")
                print(out[-1], flush=True)
            out.append(f"{m} | {100 * tgt:.0f} | n ratio oracle/human {ns['oracle'] / ns['human']:.3f}, oracle/ppi1 {ns['oracle'] / ns['ppi1']:.3f}")
    out += ["", "pilot version: pilot of 400 random tweets -> per-language lam, S2 estimated -> n by the rule -> fresh audit from the other tweets",
            "coder | target pts | mean planned n | sd planned n | oracle n | mean half | 95th pct half | share of audits with half <= 1.05 target | coverage"]
    for m in MODELS:
        f, ls, s2s = plans[m]
        for tgt in TARGETS:
            rr = random.Random(SEED + 1)
            res, planned = [], []
            for _ in range(REPS // 2):
                pil = set(rr.sample(range(n), PILOT))
                s2h, lh = [], []
                for k in LANGS:
                    ids = [i for i in sets[k] if i in pil]
                    ya, fa = [human[i] for i in ids], [f[i] for i in sets[k]]
                    fp = [f[i] for i in ids]
                    vf = E._var(fa)
                    lam = 0.0 if vf == 0 else min(1.0, max(0.0, E._cov(ya, fp) / vf))
                    lh.append(lam)
                    s2h.append(max(1e-4, E._var([a - lam * b for a, b in zip(ya, fp)])))
                nn = math.ceil(E.neyman_total(sizes, s2h, tgt))
                al = allocate(nn, sizes, s2h)
                al = [min(a, len([i for i in sets[k] if i not in pil])) for a, k in zip(al, LANGS)]
                planned.append(sum(al))
                r = est(rr, sets, f, human, truth, al, "tuned", None, exclude=pil)
                res.append(r)
            a, p95, cov = summarise(res)
            share = sum(r[0] <= 1.05 * tgt for r in res) / len(res)
            o = math.ceil(E.neyman_total(sizes, s2s["oracle"], tgt))
            out.append(f"{m} | {100 * tgt:.0f} | {statistics.fmean(planned):.0f} | {statistics.pstdev(planned):.0f} | {o} | {a:.2f} | {p95:.2f} | {share:.3f} | {cov:.3f}")
            print(out[-1], flush=True)
    (HERE / "h6q_naija_sizing.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
