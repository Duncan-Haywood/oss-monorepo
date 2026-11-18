"""Summarise results/paired_*_<year>.json into results/paired_summary_<year>.txt.

Usage: python3 src/summarise_paired.py 2022 [--seeds 3] [--pulled 2026-11-07]
Values are % of the boosted pinball (negative = neural better); * = interval excludes 0.
"""
import argparse, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "..", "results")
PAIRS = [("austin", "a2i"), ("austin", "i2c"), ("chicago", "a2i"), ("sf", "a2i"), ("sf", "i2c")]


def summarise(year, pulled, resamples=2000):
    lines, worse, better, tie, seeds = [], 0, 0, 0, set()
    for city, tgt in PAIRS:
        r = json.load(open(os.path.join(RES, f"paired_{city}_{tgt}_{year}.json")))
        seeds.add(r["seeds"])
        for t, c in r["cells"].items():
            sig = c["lo"] > 0 or c["hi"] < 0
            worse += sig and c["lo"] > 0
            better += sig and c["hi"] < 0
            tie += not sig
            lines.append("%-7s %s q%s: %+.2f%% (95%% %+.2f to %+.2f)%s" % (
                city, tgt, t, 100 * c["rel"], 100 * c["lo"] / c["boosted"], 100 * c["hi"] / c["boosted"],
                "  *" if sig else ""))
    head = ("Per-permit paired week-block bootstrap, neural minus boosted pinball, test year %d, %s seeds each, "
            "%d resamples of test weeks.\nValues are %% of the boosted pinball; negative = neural better. "
            "Source: results/paired_*_%d.json (feeds pulled %s).\n\n" % (year, "/".join(map(str, sorted(seeds))), resamples, year, pulled))
    tail = ("\n* = interval excludes 0. %d cells: interval includes 0 in %d, neural significantly worse in %d, "
            "significantly better in %d.\n" % (len(lines), tie, worse, better))
    return head + "\n".join(lines) + "\n" + tail


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("year", type=int)
    ap.add_argument("--pulled", required=True)
    a = ap.parse_args()
    txt = summarise(a.year, a.pulled)
    open(os.path.join(RES, f"paired_summary_{a.year}.txt"), "w").write(txt)
    print(txt)
