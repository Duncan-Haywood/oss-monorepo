"""Session 81: table of the minimum-support rule's transfer contrasts (reference = all test rows).

  python3 src/summarise_minsup.py [--k 1000]
Reads results/censored_eval_validate_<held>_i2c_<year>_pp<year+2>_*minsup*.json and prints, per city and
year: the classes the rule folds, the test-row share they hold, and at q0.5 and q0.9 type minus cascade2
and minsup minus cascade2 with 95% week-block intervals, plus the share of cascade2's effect against type
that the rule undoes. Writes results/minsup_summary.json.
"""
import argparse, glob, json, os

RES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")


def row(r, k):
    name = f"cascade2_minsup{k}"
    c, m = r["contrasts"], r["minsup"][name]
    split = r["by_class"]["reference"][f"transfer:type-cascade2"]["0.9"]
    n = sum(v["n"] for v in split.values())
    out = dict(held=r["held_out"], year=r["test_year"], k=k, fold=sorted(m["fold"]),
               n_source_folded={x: m["n_source"][x] for x in sorted(m["fold"])},
               test_share_folded=sum(split[x]["n"] for x in m["fold"] if x in split) / n)
    for t in ("0.5", "0.9"):
        ty, ms = c["transfer:type-cascade2"][t]["reference"], c[f"transfer:{name}-cascade2"][t]["reference"]
        out[t] = dict(type_minus_cascade2=ty, minsup_minus_cascade2=ms,
                      share_of_type_effect_undone=ms["diff"] / ty["diff"] if ty["diff"] else None)
    return out


def main(k):
    rows = []
    for p in sorted(glob.glob(os.path.join(RES, f"censored_eval_validate_*_i2c_*cascade2_minsup{k}*.json"))):
        rows.append(row(json.load(open(p)), k))
    rows.sort(key=lambda x: (x["held"], x["year"]))
    return rows


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--k", type=int, default=1000)
    a = ap.parse_args()
    rows = main(a.k)
    json.dump(rows, open(os.path.join(RES, "minsup_summary.json"), "w"), indent=1)
    f = lambda d: "%+.2f [%.2f, %.2f]" % (d["diff"], d["lo"], d["hi"])
    for x in rows:
        print(x["held"], x["year"], x["fold"], "%.1f%%" % (100 * x["test_share_folded"]),
              *[f"q{t}: type {f(x[t]['type_minus_cascade2'])} minsup {f(x[t]['minsup_minus_cascade2'])} "
                f"undone {x[t]['share_of_type_effect_undone']:.2f}" for t in ("0.5", "0.9")], sep=" | ")
