"""Publish the permit-duration prior (milestone 7): per city, target and permit type,
the empirical q10/q50/q90 and same-day share over a trailing window of years.

Uses the harness's quantile (type 7) and loader, so numbers match the paper's baseline.
Types with fewer than MIN_N rows are folded into an all-types row, never dropped silently.
  python3 src/prior.py DIR --years 2022 2023 2024 --out results/permit_prior.json
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from harness import load, quantile

MIN_N = 30
TAUS = (0.1, 0.5, 0.9)
FILES = {"chicago": ("a2i",), "sf": ("a2i", "i2c"), "austin": ("a2i", "i2c")}


def stats(ys):
    return dict(n=len(ys), same_day_share=round(sum(y == 0 for y in ys) / len(ys), 4),
                **{f"q{int(t*100)}": round(quantile(ys, t), 1) for t in TAUS})


def build(dirpath, years):
    lo, hi = min(years), max(years)
    out = []
    for city, targets in FILES.items():
        path = os.path.join(dirpath, f"{city}.csv")
        if not os.path.exists(path):
            continue
        for tg in targets:
            rows, neg = load(path, tg)
            rows = [r for r in rows if lo <= int(r["start"][:4]) <= hi]
            by = {}
            for r in rows:
                by.setdefault(r["type"], []).append(r["y"])
            small = [y for v in by.values() if len(v) < MIN_N for y in v]
            out.append(dict(city=city, target=tg, window=[lo, hi], negative_dropped=neg,
                            all_types=stats([r["y"] for r in rows]),
                            types={k: stats(v) for k, v in sorted(by.items()) if len(v) >= MIN_N},
                            folded_small_types=len(small)))
    return out


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("dir"); p.add_argument("--years", type=int, nargs="+", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    res = dict(units="days", note="Descriptive empirical quantiles from public city feeds, not advice or a promise "
               "of any permit's timing. Start year is the application date (a2i) or issue date (i2c).",
               prior=build(a.dir, a.years))
    json.dump(res, open(a.out, "w"), indent=1)
    print("wrote", a.out, [(e["city"], e["target"], e["all_types"]["n"]) for e in res["prior"]])
