"""Session 82: the minimum-support rule with thin classes folded to missing, against folding to "other".

  python3 src/summarise_minsupna.py [--k 1000]
Reads results/censored_eval_validate_<held>_i2c_<year>_pp<year+2>_cascade2-type-cascade2_minsup<k>-cascade2_minsupna<k>.json
and prints, per city and year, at q0.5 and q0.9 (all test rows, the reference score; days of mean pinball loss
with 95% week-block intervals, negative = the first term better): type minus cascade2, minsup minus cascade2,
minsupna minus cascade2 and minsupna minus minsup, plus the test-row share the rule folds and the predictions
N1 to N5 of LOG.md session 82 checked mechanically. Writes results/minsupna_summary.json.
"""
import argparse, glob, json, os

RES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
TERMS = ("type", "minsup", "minsupna")


def row(r, k):
    ms, na = f"cascade2_minsup{k}", f"cascade2_minsupna{k}"
    c, f = r["contrasts"], r["minsup"][na]
    split = r["by_class"]["reference"]["transfer:type-cascade2"]["0.9"]
    n = sum(v["n"] for v in split.values())
    out = dict(held=r["held_out"], year=r["test_year"], k=k, fold=sorted(f["fold"]),
               n_source_folded={x: f["n_source"][x] for x in sorted(f["fold"])},
               test_share_folded=sum(split[x]["n"] for x in f["fold"] if x in split) / n)
    names = {"type": "transfer:type-cascade2", "minsup": f"transfer:{ms}-cascade2",
             "minsupna": f"transfer:{na}-cascade2", "minsupna_minus_minsup": f"transfer:{na}-{ms}"}
    for t in ("0.5", "0.9"):
        out[t] = {key: c[name][t]["reference"] for key, name in names.items()}
    return out


def verdicts(rows):
    """Predictions N1 to N5 (LOG.md session 82), each held only if it holds in every listed year."""
    by = {(x["held"], x["year"]): x for x in rows}
    yrs = (2021, 2022)
    get = lambda h: [by[(h, y)] for y in yrs if (h, y) in by]
    A, S, W = get("austin"), get("sf"), get("seattle")
    v = {}
    if len(A) == 2:
        v["N1"] = all(x["0.9"]["minsupna"]["hi"] < 0 for x in A)
        v["N2"] = all(x["0.5"]["minsupna"]["diff"] < 1 for x in A)
        v["N3"] = all(x["0.5"]["minsupna_minus_minsup"]["hi"] < 0 and x["0.9"]["minsupna_minus_minsup"]["diff"] <= 1
                      for x in A)
    if len(S) == 2:
        v["N4"] = all(abs(x["0.9"]["minsupna"]["diff"]) <= 0.1 * abs(x["0.9"]["type"]["diff"]) for x in S)
    if len(W) == 2:
        v["N5"] = all(abs(x[t]["minsupna"]["diff"]) < 1 for x in W for t in ("0.5", "0.9"))
    return v


def main(k):
    pat = f"censored_eval_validate_*_i2c_*_cascade2-type-cascade2_minsup{k}-cascade2_minsupna{k}.json"
    rows = [row(json.load(open(p)), k) for p in sorted(glob.glob(os.path.join(RES, pat)))]
    rows.sort(key=lambda x: (x["held"], x["year"]))
    return rows


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--k", type=int, default=1000)
    a = ap.parse_args()
    rows = main(a.k)
    v = verdicts(rows)
    json.dump(dict(rows=rows, predictions=v), open(os.path.join(RES, "minsupna_summary.json"), "w"), indent=1)
    f = lambda d: "%+.2f [%.2f, %.2f]" % (d["diff"], d["lo"], d["hi"])
    for x in rows:
        print(x["held"], x["year"], x["fold"], "%.1f%%" % (100 * x["test_share_folded"]))
        for t in ("0.5", "0.9"):
            print("  q" + t, *[f"{key} {f(x[t][key])}" for key in (*TERMS, "minsupna_minus_minsup")], sep=" | ")
    print("predictions:", v)
