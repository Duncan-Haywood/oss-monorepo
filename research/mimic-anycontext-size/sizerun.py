"""mimic-anycontext-size: is the prompted detector's inversion (AUROC < 0.5) a model-size effect?

Scores the first N_CAND of mimic-anycontext-prompt's candidate detector prompts on its 30+30 test
texts per family with Qwen2.5 instruct models of several sizes. Scores are cached per model.
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-anycontext-prompt"))
import anyprompt  # noqa: E402
core = anyprompt.core

MODELS = ["Qwen/Qwen2.5-0.5B-Instruct", "Qwen/Qwen2.5-1.5B-Instruct", "Qwen/Qwen2.5-3B-Instruct"]
N_CAND = 4

def cache_path(model):
    return os.path.join(HERE, "scores_" + model.split("/")[1] + ".json")

def run(model):
    from lm import LM
    data, cands = anyprompt.load(), anyprompt.candidates(n=N_CAND)
    out = cache_path(model)
    cache = json.load(open(out)) if os.path.exists(out) else {}
    lm = LM(model=model)
    for ci, c in enumerate(cands):
        for fam, d in data.items():
            for lab in ("human", "llm"):
                k = f"{ci}|{fam}|test|{lab}"
                if k in cache: continue
                t = d[lab]["test"]
                cache[k] = lm.logit_diff([c["text"]] * len(t), [anyprompt.single_user(x) for x in t], "Yes", "No")
        json.dump(cache, open(out, "w"))
        print(model, "candidate", ci, "done", flush=True)

def analyse(models=MODELS):
    """Per model: mean-over-families AUROC of each candidate, of the best-of-N_CAND chosen on the test
    texts (optimistic), and of the sign-flipped (1 - AUROC) score, plus per-family AUROC of candidate 0."""
    res = {}
    for m in models:
        p = cache_path(m)
        if not os.path.exists(p): continue
        sc = anyprompt.nest(json.load(open(p)))
        fams = sorted(sc[0])
        mean = lambda xs: sum(xs) / len(xs)
        per = [mean([anyprompt.fam_auc(sc, c, f, "test") for f in fams]) for c in sc]
        pooled = [anyprompt.pool_auc(sc, c, fams, "test") for c in sc]
        frac_inv = mean([int(anyprompt.fam_auc(sc, c, f, "test") < 0.5) for c in sc for f in fams])
        res[m] = {"families": fams, "mean_auroc_by_candidate": per, "pooled_auroc_by_candidate": pooled,
                  "plain_by_family": {f: anyprompt.fam_auc(sc, 0, f, "test") for f in fams},
                  "best_candidate_mean": max(per), "flipped_plain_mean": 1 - per[0],
                  "share_family_candidate_cells_below_half": frac_inv}
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    return res

if __name__ == "__main__":
    if "--analyse" in sys.argv:
        print(json.dumps(analyse(), indent=1))
    else:
        sys.path.insert(0, os.path.join(HERE, "..", "mimic-loop"))
        for m in (sys.argv[1:] or MODELS): run(m)
