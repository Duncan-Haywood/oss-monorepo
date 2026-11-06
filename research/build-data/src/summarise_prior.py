"""Milestone 7 table: results/permit_prior.json -> results/permit_prior_table.md (all-types rows, plus per-type q50/q90 range)."""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(here, "..", "results", "permit_prior.json")))
out = ["| city | target | window | n | same-day | q10 | q50 | q90 | types kept | rows folded |", "|---|---|---|---|---|---|---|---|---|---|"]
for p in d["prior"]:
    a = p["all_types"]
    out.append("| %s | %s | %d-%d | %d | %.1f%% | %g | %g | %g | %d | %d |" % (
        p["city"], p["target"], p["window"][0], p["window"][1], a["n"], 100 * a["same_day_share"],
        a["q10"], a["q50"], a["q90"], len(p["types"]), p["folded_small_types"]))
out.append("\nDays. Descriptive empirical quantiles (type-7) of public city feeds, not advice or a promise of any permit's timing.")
open(os.path.join(here, "..", "results", "permit_prior_table.md"), "w").write("\n".join(out) + "\n")
