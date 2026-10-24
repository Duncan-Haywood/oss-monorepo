"""The session agent as a coder on 300 real GoEmotions comments, against the qual-real coders.

    python3 experiments/run.py      # a few seconds after the ~14 MB download (cache shared with qual-real)

Writes experiments/results.txt. Truth is the rater-majority code; the agent coded the comments without it.
"""
import json
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent.parent / "qual-real" / "experiments"))
import qualagent as a  # noqa: E402
import run as real  # noqa: E402  (qual-real's run.py: fetch())

r, q = a.r, a.q
REPS, SIZES, SEED = 2000, (30, 60, 100), 20261023


def main():
    ex = r.load_examples(real.fetch())
    train, test = a.split(ex)
    corpus = a.sample_corpus(test)
    blob = json.loads((HERE.parent / "agent_codes.json").read_text())
    codes = blob["codes"]
    assert [e[0] for e in corpus] == list(codes), "agent_codes.json does not match the regenerated sample"
    agent = [codes[e[0]] for e in corpus]
    human = [e[2] for e in corpus]
    grp = [r.group_of(e[3]) for e in corpus]
    nb = r.NaiveBayes().fit([e[1] for e in train], [e[2] for e in train])
    scores = sorted(nb.score(e[1]) for e in train)
    nb.bias = scores[int((1 - sum(e[2] for e in train) / len(train)) * len(scores))]
    coders = {"agent": agent, "naive-bayes": [nb.code(e[1]) for e in corpus],
              "lexicon": [r.lexicon_code(e[1]) for e in corpus]}
    n = len(corpus)
    sets = {"all": set(range(n)), "short": {i for i in range(n) if grp[i] == "short"},
            "long": {i for i in range(n) if grp[i] == "long"}}
    truth = {k: statistics.fmean(human[i] for i in s) for k, s in sets.items()}
    tgap = truth["short"] - truth["long"]
    out = [f"{n} comments sampled at random (seed {a.SAMPLE_SEED}) from the 3,188-item qual-real corpus; "
           f"human prevalence of negative emotion {truth['all']:.4f}",
           f"short (<=10 words) n={len(sets['short'])} prevalence {truth['short']:.4f}; long n={len(sets['long'])} "
           f"prevalence {truth['long']:.4f}; true gap short-long {tgap:+.4f}", ""]

    out.append("E1. Each coder against the human code (95% Wilson intervals for sens/spec/acc)")
    out.append("coder  coded_pos  sens  sens_ci  spec  spec_ci  acc  acc_ci  kappa  sens_short  sens_long  spec_short  spec_long")
    for name, c in coders.items():
        tp = sum(1 for x, y in zip(c, human) if x and y)
        fn = sum(1 for x, y in zip(c, human) if not x and y)
        tn = sum(1 for x, y in zip(c, human) if not x and not y)
        fp = sum(1 for x, y in zip(c, human) if x and not y)
        def g(s):
            cc = r.confusion([c[i] for i in sorted(s)], [human[i] for i in sorted(s)])
            return cc["sens"], cc["spec"]
        ss, sp = g(sets["short"])
        ls, lp = g(sets["long"])
        w = lambda k, m: "[%.2f,%.2f]" % a.wilson(k, m)
        out.append(f"{name} {sum(c)} {tp / (tp + fn):.3f} {w(tp, tp + fn)} {tn / (tn + fp):.3f} {w(tn, tn + fp)} "
                   f"{(tp + tn) / n:.3f} {w(tp + tn, n)} {q.cohen_kappa(c, human):.3f} {ss:.3f} {ls:.3f} {sp:.3f} {lp:.3f}")
    out.append("")
    out.append("E2. Is the agent more accurate than each stand-in? (exact McNemar on the same items)")
    for name in ("naive-bayes", "lexicon"):
        b = sum(1 for x, y, h in zip(agent, coders[name], human) if x == h and y != h)
        cc = sum(1 for x, y, h in zip(agent, coders[name], human) if x != h and y == h)
        out.append(f"agent right & {name} wrong: {b}; reverse: {cc}; p = {a.mcnemar_exact(b, cc):.2g}")
    out.append("")
    out.append("E3. Where the agent and the human disagree (counts)")
    fp = [i for i in range(n) if agent[i] and not human[i]]
    fn_ = [i for i in range(n) if not agent[i] and human[i]]
    out.append(f"agent=1 human=0: {len(fp)}; agent=0 human=1: {len(fn_)}")
    out.append("")

    rng = random.Random(SEED)
    for name, c in coders.items():
        for ng in SIZES:
            acc = {k: {m: [] for m in ("naive", "human", "ppi")} for k in ("all", "gap")}
            for _ in range(REPS):
                gold = rng.sample(range(n), ng)
                est = {k: r.estimates(c, human, gold, s) for k, s in sets.items()}
                for m, e in est["all"].items():
                    acc["all"][m].append(e)
                for m in ("naive", "human", "ppi"):
                    if m in est["short"] and m in est["long"]:
                        acc["gap"][m].append(q.gap(est["short"][m], est["long"][m]))
            out.append(f"E4. {name}, {ng} hand-coded of {n}, {REPS} draws")
            out.append("target  estimator  true  mean_est  bias  coverage  width  draws")
            for k, label, t in (("all", "prevalence", truth["all"]), ("gap", "gap(short-long)", tgap)):
                for m in ("naive", "human", "ppi"):
                    rows = acc[k][m]
                    if rows:
                        mean, cov, w = a.summarise(rows, t)
                        out.append(f"{label} {m} {t:.4f} {mean:.4f} {mean - t:+.4f} {cov:.3f} {w:.4f} {len(rows)}")
            out.append("")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
