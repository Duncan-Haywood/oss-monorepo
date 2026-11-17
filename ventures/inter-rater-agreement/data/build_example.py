"""Build data/goemotions-sentiment.csv from the GoEmotions raw annotation files.

    python3 data/build_example.py goemotions_1.csv goemotions_2.csv goemotions_3.csv > data/goemotions-sentiment.csv

Standard library only. Each raw row is one rater's labels for one Reddit
comment (Demszky et al. 2020, Apache-2.0). This script keeps the first 300
comments, in the order they first appear in goemotions_1.csv, that at least
three raters labelled across the three files, and reduces each rater's labels
to one sentiment with the dataset's own sentiment_mapping.json groups:

- only "neutral" ticked -> neutral
- every ticked emotion in one group -> that group (positive, negative, ambiguous)
- emotions from more than one group (or neutral plus an emotion) -> mixed
- the rater marked the comment "very unclear", or ticked nothing -> blank (missing)

The comment text is not copied; the comment id links back to the source row.
"""
import csv
import sys

GROUPS = {
    "positive": ["amusement", "excitement", "joy", "love", "desire", "optimism", "caring", "pride", "admiration", "gratitude", "relief", "approval"],
    "negative": ["fear", "nervousness", "remorse", "embarrassment", "disappointment", "sadness", "grief", "disgust", "anger", "annoyance", "disapproval"],
    "ambiguous": ["realization", "surprise", "curiosity", "confusion"],
}
GROUP_OF = {e: g for g, es in GROUPS.items() for e in es}
GROUP_OF["neutral"] = "neutral"
N_ITEMS = 300
MIN_RATERS = 3


def sentiment(row):
    if row["example_very_unclear"] == "True":
        return ""
    groups = {GROUP_OF[e] for e in GROUP_OF if row[e] == "1"}
    if not groups:
        return ""
    return groups.pop() if len(groups) == 1 else "mixed"


def main(paths):
    rows, order = [], []
    seen = set()
    for i, p in enumerate(paths):
        with open(p, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                rows.append((r["id"], r["rater_id"], sentiment(r)))
                if i == 0 and r["id"] not in seen:
                    seen.add(r["id"])
                    order.append(r["id"])
    by_item = {}
    for item, rater, s in rows:
        by_item.setdefault(item, []).append((rater, s))
    keep = [i for i in order if len(by_item[i]) >= MIN_RATERS][:N_ITEMS]
    out = csv.writer(sys.stdout, lineterminator="\n")
    out.writerow(["comment_id", "rater_id", "sentiment"])
    for item in keep:
        for rater, s in sorted(by_item[item], key=lambda x: int(x[0])):
            out.writerow([item, rater, s])


if __name__ == "__main__":
    main(sys.argv[1:])
