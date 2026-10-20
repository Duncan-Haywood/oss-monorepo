"""mimic-anycontext-prompt: does a prompted 0.5B human-vs-machine detector's prompt carry to held-out families?

Every candidate detector prompt scores every text once (cached to scores.json); the regimes
(plain, universal, per-family, held-out) are then selections over that cache, so they use the
same model calls and differ only in which texts pick the prompt.
"""
import gzip, json, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-loop"))
import core  # noqa: E402  (model-free helpers from mimic-loop)

SUITE = core.SUITE
BASE = "You judge whether a text was written by a person or by an AI model."
N_OPT, N_TEST = 10, 30          # per class, per family
N_CAND = 16                     # plain prompt + 15 random fragment subsets
FOLDS = 4                       # leave-two-families-out folds over the sorted family list

def single_user(t):
    return f"Text:\n{t}\n\nWas this text written by a person? Answer Yes or No."

def load(path=SUITE, seed=0):
    rows = [json.loads(l) for l in gzip.open(path, "rt", encoding="utf8")]
    data = {}
    for fam in sorted({r["family"] for r in rows}):
        d = {}
        for lab in ("human", "llm"):
            xs = [r for r in rows if r["family"] == fam and r["label"] == lab]
            xs.sort(key=lambda r: r["id"])
            random.Random(seed).shuffle(xs)
            texts = [core.trunc(r["text"]) for r in xs]
            texts = [t for t in texts if len(t) >= 0.8 * core.CHARS]
            assert len(texts) >= N_OPT + N_TEST, (fam, lab, len(texts))
            d[lab] = {"opt": texts[:N_OPT], "test": texts[N_OPT:N_OPT + N_TEST]}
        data[fam] = d
    return data

def candidates(seed=0, n=N_CAND):
    rng = random.Random(seed)
    bank = core.DETECTOR_FRAGMENTS
    out, seen = [core.make(BASE, bank, [0] * len(bank))], {(0,) * len(bank)}
    while len(out) < n:
        bits = tuple(int(rng.random() < 0.4) for _ in bank)
        if sum(bits) and bits not in seen:
            seen.add(bits); out.append(core.make(BASE, bank, bits))
    return out

def nest(cache):
    """Flat cache keys 'cand|family|split|label' to scores[cand][family][split][label]."""
    out = {}
    for k, v in cache.items():
        c, f, sp, lab = k.split("|")
        out.setdefault(int(c), {}).setdefault(f, {}).setdefault(sp, {})[lab] = v
    return out

def fam_auc(scores, cand, fam, split):
    """AUROC (human above machine) of candidate `cand` on one family's split."""
    s = scores[cand][fam][split]
    return core.auroc(s["human"], s["llm"])

def pool_auc(scores, cand, fams, split):
    h = [x for f in fams for x in scores[cand][f][split]["human"]]
    m = [x for f in fams for x in scores[cand][f][split]["llm"]]
    return core.auroc(h, m)

def pick(scores, cands, fams, split="opt"):
    """Candidate index with the best pooled AUROC on `fams` (ties: lowest index, so plain wins ties)."""
    return max(range(cands), key=lambda c: (pool_auc(scores, c, fams, split), -c))

def regimes(scores, fams, n_cand):
    """Per-fold universal pick, per-family pick, plain, and the best-of-all-candidates oracle."""
    held_pairs = [fams[i::FOLDS] for i in range(FOLDS)]
    rows = []
    for held in held_pairs:
        seen = [f for f in fams if f not in held]
        u = pick(scores, n_cand, seen)
        for f in held:
            aucs = [fam_auc(scores, c, f, "test") for c in range(n_cand)]
            rows.append({"family": f, "universal_pick": u, "universal_heldout": aucs[u], "plain": aucs[0],
                         "per_family_pick": (pf := pick(scores, n_cand, [f])), "per_family": aucs[pf],
                         "random_prompt_mean": sum(aucs) / n_cand, "oracle": max(aucs)})
        for f in seen:
            rows.append({"family": f, "universal_pick": u, "universal_seen_fold": fam_auc(scores, u, f, "test"),
                         "fold_seen_for": held})
    return rows

def analyse():
    scores = nest(json.load(open(os.path.join(HERE, "scores.json"))))
    n = len(scores)
    fams = sorted(scores[0])
    rows = regimes(scores, fams, n)
    held = [r for r in rows if "universal_heldout" in r]
    seen = [r for r in rows if "universal_seen_fold" in r]
    mean = lambda xs: sum(xs) / len(xs)
    res = {"n_candidates": n, "families": fams,
           "per_family": {r["family"]: {k: v for k, v in r.items() if k != "family"} for r in held},
           "mean": {"plain": mean([r["plain"] for r in held]),
                    "universal_heldout": mean([r["universal_heldout"] for r in held]),
                    "universal_seen": mean([r["universal_seen_fold"] for r in seen]),
                    "per_family": mean([r["per_family"] for r in held]),
                    "random_prompt": mean([r["random_prompt_mean"] for r in held]),
                    "oracle": mean([r["oracle"] for r in held])}}
    # every candidate's mean AUROC over all families, for the spread
    res["candidate_mean_test_auroc"] = [mean([fam_auc(scores, c, f, "test") for f in fams]) for c in range(n)]
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    return res

def main():
    from lm import LM  # needs torch; imported lazily so the tests run without it
    data, cands = load(), candidates()
    lm = LM()
    out = os.path.join(HERE, "scores.json")
    cache = json.load(open(out)) if os.path.exists(out) else {}
    for ci, c in enumerate(cands):
        for fam, d in data.items():
            for split in ("opt", "test"):
                for lab in ("human", "llm"):
                    k = f"{ci}|{fam}|{split}|{lab}"
                    if k in cache: continue
                    t = d[lab][split]
                    cache[k] = lm.logit_diff([c["text"]] * len(t), [single_user(x) for x in t], "Yes", "No")
        json.dump(cache, open(out, "w"))
        print("candidate", ci, "done", flush=True)
    json.dump({"candidates": [c["text"] for c in cands]}, open(os.path.join(HERE, "candidates.json"), "w"), indent=1)

if __name__ == "__main__":
    if "--analyse" in sys.argv:
        print(json.dumps(analyse()["mean"], indent=1))
    else:
        main()
