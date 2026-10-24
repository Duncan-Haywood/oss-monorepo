"""Do word hypotheses about what separates negative-emotion Reddit comments from the rest replicate on held-out
comments, as the discovery sample grows, and with the labels shuffled? Downloads the CSV on first use
(shared cache with qual-real, not committed). Writes experiments/results.txt.

    python3 experiments/run.py      # about 1 minute, stdlib only, seeded
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualhyp as h  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

SIZES, K, REPS, HELD, SEED = (100, 300, 1000, 2000), 20, 200, 3000, 20261020


def study(ex, n_disc, rng, shuffle=False):
    disc, held = h.split(ex, n_disc, HELD, rng)
    if shuffle:
        rng.shuffle(disc[1])
        rng.shuffle(held[1])
    hyps = h.propose(*disc, K)
    return h.test_hypotheses(hyps, *held)


def main():
    ex = real.r.load_examples(real.fetch())
    rng = random.Random(SEED)
    share = sum(e[2] for e in ex) / len(ex)
    out = [f"GoEmotions (first file): {len(ex)} examples; set 1 = human code negative emotion ({share:.3f}), set 0 = the rest.",
           f"Hypothesis = 'the comment contains the word w'. Proposer: the {K} words with the largest |z| in a discovery sample "
           f"(word in at least 5 discovery comments). Held-out: {HELD} other comments, BH at 5% over the {K}. "
           f"{REPS} random splits per row, seeded.", ""]
    out.append("E1. Replication of the proposer's top hypotheses on held-out comments")
    out.append("discovery_n mean_disc_effect mean_heldout_effect replicated_of_20 share_replicated_that_restate_label")
    for n in SIZES:
        de, he, rep, restate, repn = [], [], [], 0, 0
        for _ in range(REPS):
            rows = study(ex, n, rng)
            de.append(statistics.fmean(abs(x[1]) for x in rows))
            he.append(statistics.fmean(abs(x[2]) for x in rows))
            win = [x for x in rows if x[4]]
            rep.append(len(win))
            restate += sum(h.restates_label(x[0]) for x in win)
            repn += len(win)
        out.append(f"{n} {statistics.fmean(de):.4f} {statistics.fmean(he):.4f} {statistics.fmean(rep):.2f} "
                   f"{(restate / repn if repn else float('nan')):.3f}")
    out.append("")
    out.append("E2. Same procedure with the labels shuffled (no true effect): discoveries that replicate, and the")
    out.append("discovery-sample effects that made them look worth testing")
    out.append("discovery_n mean_disc_effect mean_heldout_effect replicated_of_20 share_of_splits_with_any_replicated")
    for n in SIZES:
        de, he, rep = [], [], []
        for _ in range(REPS):
            rows = study(ex, n, rng, shuffle=True)
            de.append(statistics.fmean(abs(x[1]) for x in rows))
            he.append(statistics.fmean(abs(x[2]) for x in rows))
            rep.append(sum(x[4] for x in rows))
        out.append(f"{n} {statistics.fmean(de):.4f} {statistics.fmean(he):.4f} {statistics.fmean(rep):.3f} "
                   f"{statistics.fmean(x > 0 for x in rep):.3f}")
    out.append("")
    out.append("E3. One full-size split (discovery 1000): the hypotheses, discovery effect, held-out effect, replicated")
    rows = study(ex, 1000, random.Random(SEED + 1))
    out.append("word disc_effect heldout_effect p replicated restates_label")
    for w, d0, d, p, ok in rows:
        out.append(f"{w} {d0:+.3f} {d:+.3f} {p:.2g} {'yes' if ok else 'no'} {'yes' if h.restates_label(w) else 'no'}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
