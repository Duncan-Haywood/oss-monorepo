"""Run the alternating prompt game for one (family, proposer, seed) and write results/<name>.json."""
import argparse, json, os, random, time
import core
from game import Game

HERE = os.path.dirname(os.path.abspath(__file__))
JUDGE = "You judge whether a text responds to a given title. Answer Yes or No."
ROLE_DET = "tell which of two texts a person wrote and which an AI wrote"
ROLE_IMIT = "write text that a person could have written, so that a reader cannot tell it from human text"
SALT = {"random": 1, "ga": 2, "grips": 3, "llm": 4}

def run(lm, family, proposer, seed, rounds, budget, log=print):
    ctx = core.load_contexts(family, seed=seed)
    g = Game(lm, family, ctx, seed)
    rng = random.Random(seed * 7919 + SALT[proposer])
    isp = core.Space(core.PLAIN_IMITATOR, core.IMITATOR_FRAGMENTS, max_shots=2, pool=len(ctx["pool"]))
    dsp = core.Space(core.PLAIN_DETECTOR, core.DETECTOR_FRAGMENTS)
    imit = core.make(isp.base, isp.bank, (0,) * len(isp.bank))
    det = core.make(dsp.base, dsp.bank, (0,) * len(dsp.bank))
    plain_det = det
    opt, test = ctx["opt"], ctx["test"]
    write = None
    if proposer == "llm":
        write = lambda mp: lm.generate(["You write short, clear instructions for language models."], [mp], max_new=120,
                                       temp=0.9, seed=rng.randrange(10 ** 6))[0]
    rec = {"family": family, "proposer": proposer, "seed": seed, "budget": budget, "rounds": []}
    state = {"imit": imit, "det": det}

    def snapshot(r):
        imit, det = state["imit"], state["det"]
        texts = g.write(imit, test, seed=999)
        ok, mlen, cr = g.valid(texts)
        m_cur = g.margins(det, test, texts); m_plain = g.margins(plain_det, test, texts)
        hs = g.single_scores(det, [x["text"] for x in test]); ls = g.single_scores(det, texts)
        jd = lm.logit_diff([JUDGE] * len(texts), [f"Title: {x['title']}\n\nText: {t}\n\nDoes the text respond to the title?"
                                                  for x, t in zip(test, texts)], "Yes", "No")
        row = {"round": r, "paired_acc_current": sum(m > 0 for m in m_cur) / len(m_cur),
               "paired_acc_current_ci": core.boot_ci([int(m > 0) for m in m_cur]),
               "paired_acc_plain": sum(m > 0 for m in m_plain) / len(m_plain),
               "single_auroc_current": core.auroc(hs, ls), "mean_len": mlen, "ref_len": g.ref_len, "copy4": cr,
               "distinct2_gen": core.distinct_n(texts), "distinct2_human": core.distinct_n([x["text"] for x in test]),
               "judge_on_topic": sum(j > 0 for j in jd) / len(jd), "valid": ok,
               "imitator": imit["text"], "imitator_shots": list(imit["shots"]), "detector": det["text"],
               "sample": texts[:3]}
        rec["rounds"].append(row)
        log(f"{family}/{proposer}/s{seed} r{r} paired(cur)={row['paired_acc_current']:.2f} plain={row['paired_acc_plain']:.2f} "
            f"auroc1={row['single_auroc_current']:.2f} len={mlen:.0f} copy={cr:.3f} judge={row['judge_on_topic']:.2f}")

    def counter():
        c = {"n": 0}
        def wrap(f):
            def h(x):
                c["n"] += 1
                return f(x)
            return h
        return c, wrap

    snapshot(0)
    for r in range(1, rounds + 1):
        t0 = time.time()
        imit, det = state["imit"], state["det"]
        # --- detector step against the current imitator's texts
        texts = g.write(imit, opt, seed=r * 1000)
        cache = {}
        def eval_det(c):
            k = core.key(c)
            if k not in cache:
                cache[k] = core.pair_fitness(g.margins(c, opt, texts, r))
            return cache[k]
        f0 = eval_det(det)
        fails = [t for t, m in zip(texts, g.margins(det, opt, texts, r)) if m <= 0]
        cnt, wrap = counter()
        (det, f_det), _ = core.PROPOSERS[proposer](dsp, wrap(eval_det), det, f0, budget, rng, write=write,
                                                   role=ROLE_DET, failures=fails)
        assert cnt["n"] == budget, (cnt, budget)
        state["det"] = det
        # --- imitator step against the new detector
        cache2 = {}
        def eval_imit(c):
            k = core.key(c)
            if k not in cache2:
                tx = g.write(c, opt, seed=r * 1000 + 1)
                ok, _, _ = g.valid(tx)
                cache2[k] = (-core.pair_fitness(g.margins(det, opt, tx, r)) - (0 if ok else 1.0), tx)
            return cache2[k][0]
        f0 = eval_imit(imit)
        tx0 = cache2[core.key(imit)][1]
        easy = [t for t, m in sorted(zip(tx0, g.margins(det, opt, tx0, r)), key=lambda z: -z[1])]
        cnt, wrap = counter()
        (imit, f_im), _ = core.PROPOSERS[proposer](isp, wrap(eval_imit), imit, f0, budget, rng, write=write,
                                                   role=ROLE_IMIT, failures=easy)
        assert cnt["n"] == budget, (cnt, budget)
        state["imit"] = imit
        snapshot(r)
        rec["rounds"][-1].update({"fit_detector": f_det, "fit_imitator": f_im, "seconds": time.time() - t0})
    rec["model_calls"] = dict(lm.calls)
    return rec

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--family", required=True); ap.add_argument("--proposer", required=True)
    ap.add_argument("--seed", type=int, default=0); ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--budget", type=int, default=4); ap.add_argument("--threads", type=int, default=2)
    a = ap.parse_args()
    from lm import LM
    out = os.path.join(HERE, "results", f"{a.family}_{a.proposer}_s{a.seed}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    rec = run(LM(threads=a.threads), a.family, a.proposer, a.seed, a.rounds, a.budget)
    json.dump(rec, open(out, "w"), indent=1)
