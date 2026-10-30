"""H1 replicate on a second real corpus: GoEmotions (Demszky et al. 2020) comments grouped by the kind
of subreddit they came from. Target = "negative" (a majority of raters marked at least one negative
emotion: anger, annoyance, disappointment, disapproval, disgust, embarrassment, fear, grief,
nervousness, remorse, sadness). Corpus = the 70% test part, so the truth is known. Writes
group_shift_reddit.txt.

    python3 experiments/group_shift_reddit.py [reps]   # downloads ~/.cache/qual-real/goemotions_{1,2,3}.csv on first use
"""
import csv
import random
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0]))
sys.path.insert(0, str(HERE))
from llmci import estimators as E  # noqa: E402
import rare_audit as ra  # noqa: E402  (loader and word-presence logistic regression; importing runs nothing)

NEG = ("anger", "annoyance", "disappointment", "disapproval", "disgust", "embarrassment", "fear", "grief",
       "nervousness", "remorse", "sadness")
# Groups fixed by hand from the 80 largest subreddits before any coder was run.
GROUPS = {
    "sports": "timberwolves minnesotavikings CollegeBasketball devils barstoolsports DetroitPistons OrlandoMagic "
              "NYGiants NYYankees Mavericks EdmontonOilers Gunners GreenBayPackers",
    "tv-dating": "loveafterlockup OkCupid vanderpumprules 90DayFiance 90dayfianceuncensored "
                 "TeenMomOGandTeenMom2 datingoverthirty My600lbLife Tinder Divorce",
    "personal": "socialanxiety confessions confession exmormon LGBTeens TooAfraidToAsk self DoesAnybodyElse "
                "AskWomen tifu SuicideWatch rant TrueOffMyChest Advice teenagers TalesFromYourServer",
    "video-cringe": "cringe AnimalsBeingBros nonononoyes AnimalsBeingJerks yesyesyesyesno instant_regret "
                    "Whatcouldgowrong nononono youseeingthisshit holdmycosmo videos KidsAreFuckingStupid",
}
SUB2G = {s: g for g, v in GROUPS.items() for s in v.split()}
N_AUDIT, SEED, SPLIT_SEED, TRAIN_SHARE = 400, 20261025, 2026, 0.3
REPS = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
DESIGNS = {"A random": None,
           "B equal quota": {"sports": 100, "tv-dating": 100, "personal": 100, "video-cringe": 100},
           "C 70% sports": {"sports": 280, "tv-dating": 40, "personal": 40, "video-cringe": 40}}


def load():
    neg, texts, sub, cnt = defaultdict(int), {}, {}, Counter()
    unclear = set()
    for p in ra.ensure_csvs():
        with open(p, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row["subreddit"] not in SUB2G:
                    continue
                i = row["id"]
                texts[i], sub[i] = row["text"], SUB2G[row["subreddit"]]
                cnt[i] += 1
                neg[i] += any(row[c] == "1" for c in NEG)
                if row["example_very_unclear"] == "True":
                    unclear.add(i)
    ids = sorted(i for i in texts if cnt[i] >= 3 and i not in unclear)
    return [(ra.toks(texts[i]), sub[i], int(neg[i] * 2 > cnt[i])) for i in ids]


def make_coder(train, test):
    """Score by logistic regression; label = score above the train quantile matching the train prevalence."""
    m = ra.NB().fit([t[0] for t in train], [t[2] for t in train])
    tr = sorted(m.score(t[0]) for t in train)
    thr = tr[int(len(tr) * (1 - sum(t[2] for t in train) / len(train)))]
    return [int(m.score(t[0]) > thr) for t in test]


def main():
    rows = load()
    rng = random.Random(SPLIT_SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    human = [t[2] for t in test]
    n = len(test)
    sets = {g: sorted(i for i in range(n) if test[i][1] == g) for g in GROUPS}
    lang_of = {i: g for g, v in sets.items() for i in v}
    coders = {"lr-pooled": make_coder(train, test),
              "lr-sports-only": make_coder([t for t in train if t[1] == "sports"], test),
              "lr-personal-only": make_coder([t for t in train if t[1] == "personal"], test)}
    truth = sum(human) / n
    out = [f"GoEmotions subreddit-group corpus {n} comments, true negative share {truth:.4f}; "
           "group size and negative share " + ", ".join(
               f"{g} {len(v)} ({sum(human[i] for i in v) / len(v):.3f})" for g, v in sets.items()),
           "coder agreement with the human label by group " + "; ".join(
               f"{c}: " + ", ".join(f"{g} {sum(f[i] == human[i] for i in v) / len(v):.3f}" for g, v in sets.items())
               for c, f in coders.items()),
           f"audit n={N_AUDIT}, {REPS} draws per cell, seed {SEED}; coverage of the 95% interval (binomial sd about 0.007), "
           "mean width, mean bias (estimate - truth), points", "",
           "design coder estimator coverage width bias"]
    print("\n".join(out), flush=True)
    for dname, quota in DESIGNS.items():
        for cname, f in coders.items():
            rr = random.Random(SEED)
            acc = {m: {"hit": 0, "w": [], "b": []} for m in
                   ("human pooled", "PPI pooled", "PPI++ pooled", "human strat", "PPI strat")}
            for _ in range(REPS):
                if quota is None:
                    idx = rr.sample(range(n), N_AUDIT)
                else:
                    idx = [i for k, q_ in quota.items() for i in rr.sample(sets[k], q_)]
                aset = set(idx)
                y, fa = [human[i] for i in idx], [f[i] for i in idx]
                fu = [f[i] for i in range(n) if i not in aset]
                ests = {"human pooled": E.human_only(y), "PPI pooled": E.ppi(y, fa, fu), "PPI++ pooled": E.ppi_pp(y, fa, fu)}
                groups = {k: [i for i in idx if lang_of[i] == k] for k in sets}
                ests["human strat"] = E.stratified_human([(len(sets[k]), [human[i] for i in groups[k]]) for k in sets])
                ests["PPI strat"] = E.stratified_ppi([(len(sets[k]), [f[i] for i in sets[k]], [human[i] for i in groups[k]],
                                                       [f[i] for i in groups[k]]) for k in sets])
                for m, e in ests.items():
                    acc[m]["hit"] += E.covers(e, truth)
                    acc[m]["w"].append(2 * E.Z95 * e.se)
                    acc[m]["b"].append(e.value - truth)
            for m, a in acc.items():
                out.append(f"{dname} | {cname} | {m} | {a['hit'] / REPS:.3f} | {100 * statistics.fmean(a['w']):.2f} | "
                           f"{100 * statistics.fmean(a['b']):+.2f}")
                print(out[-1], flush=True)
    (HERE / "group_shift_reddit.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
