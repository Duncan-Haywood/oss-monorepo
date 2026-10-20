"""Does the coders' error differ by writing register on GoEmotions, how far does that move a register
comparison, and how many hand-coded items reveal it? Downloads the CSV on first use (shared cache with
qual-real, not committed). Writes experiments/results.txt.

    python3 experiments/run.py      # about 1-2 minutes, stdlib only, seeded
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualregister as g  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

r, q = g.r, g.q
REPS, SIZES, SEED, DRAWS = 500, (50, 100, 200, 400, 800), 20261020, 200


def main():
    ex = r.load_examples(real.fetch())
    rng = random.Random(SEED)
    order = list(range(len(ex)))
    rng.shuffle(order)
    cut = int(0.4 * len(ex))
    train, test = [ex[i] for i in order[:cut]], [ex[i] for i in order[cut:]]
    nb = r.NaiveBayes().fit([e[1] for e in train], [e[2] for e in train])
    scores = sorted(nb.score(e[1]) for e in train)
    share = sum(e[2] for e in train) / len(train)
    nb.bias = scores[int((1 - share) * len(scores))]
    human = [e[2] for e in test]
    grp = [g.register_of(e[1]) for e in test]
    coders = {"naive-bayes": [nb.code(e[1]) for e in test], "lexicon": [r.lexicon_code(e[1]) for e in test]}
    n = len(test)
    sets = {"all": set(range(n)), "formal": {i for i in range(n) if grp[i] == "formal"},
            "informal": {i for i in range(n) if grp[i] == "informal"}}
    truth = {k: statistics.fmean(human[i] for i in s) for k, s in sets.items()}
    truth_gap = truth["informal"] - truth["formal"]
    out = [f"GoEmotions (first file): {len(ex)} examples; {len(train)} train the coder, {n} evaluated.",
           "code = majority of raters marked a negative emotion; group = register (formal: starts with a capital "
           "and ends in . ! or ?; informal: otherwise).",
           f"human prevalence: all {truth['all']:.4f}, formal {truth['formal']:.4f} (n={len(sets['formal'])}), "
           f"informal {truth['informal']:.4f} (n={len(sets['informal'])}); gap informal-formal {truth_gap:+.4f}", ""]
    out.append("E1. The coders against human labels, by register")
    out.append("coder group sens spec acc error_rate")
    err = {}
    for name, llm in coders.items():
        for k in ("formal", "informal"):
            m = sorted(sets[k])
            c = r.confusion([llm[i] for i in m], [human[i] for i in m])
            err[name, k] = g.error_rate(llm, human, m)
            out.append(f"{name} {k} {c['sens']:.3f} {c['spec']:.3f} {c['acc']:.3f} {err[name, k]:.4f}")
        out.append(f"{name} error_rate_difference(informal-formal) {err[name, 'informal'] - err[name, 'formal']:+.4f}")
    out.append("")
    out.append("E2. Gap in negative-emotion share, informal minus formal, 200 hand-coded items, "
               f"{REPS} draws (true {truth_gap:+.4f})")
    out.append("coder estimator mean_est bias coverage width")
    for name, llm in coders.items():
        acc = {m: [] for m in ("naive", "human", "ppi")}
        for _ in range(REPS):
            gold = rng.sample(range(n), 200)
            est = {k: r.estimates(llm, human, gold, s) for k, s in sets.items() if k != "all"}
            for m in acc:
                if m in est["informal"] and m in est["formal"]:
                    acc[m].append(q.gap(est["informal"][m], est["formal"][m]))
        for m, rows in acc.items():
            mean = statistics.fmean(e[0] for e in rows)
            out.append(f"{name} {m} {mean:+.4f} {mean - truth_gap:+.4f} "
                       f"{statistics.fmean(q.covers(e, truth_gap) for e in rows):.3f} "
                       f"{statistics.fmean(2 * q.Z95 * e[1] for e in rows):.4f}")
    out.append("")
    out.append(f"E3. Share of {DRAWS} random hand-coded samples whose z test (5%) finds the coder's error rate differs by register")
    out.append("coder " + " ".join(f"n={s}" for s in SIZES))
    for name, llm in coders.items():
        out.append(name + " " + " ".join(f"{g.detection_rate(llm, human, grp, s, DRAWS, rng):.3f}" for s in SIZES))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
