"""Milestone 7 table: results/pooled_*.json -> results/m7_table.md (mean-3 pinball, % vs full-history baseline)."""
import glob, json, os
here = os.path.dirname(os.path.abspath(__file__))
out = ["| pair | n | base_n | local_n | pooled w1 | pooled w20 |", "|---|---|---|---|---|---|"]
for f in sorted(glob.glob(os.path.join(here, "..", "results", "pooled_*.json"))):
    r = json.load(open(f)); name = os.path.basename(f)[7:-10]
    for row in r["rows"]:
        cell = lambda k: ("%.2f (%+.0f%%%s)" % (row[k]["mean3"], 100 * row[k]["vs_full"]["rel"],
                          "*" if row[k]["vs_full"]["hi"] < 0 else "")) if k in row else "-"
        out.append("| %s (full %.2f) | %d | %s | %s | %s | %s |" % (name, r["full_base"]["mean3"], row["n"],
                   cell("base_n"), cell("local_n"), cell("pooled_w1"), cell("pooled_w20")))
out.append("\n`*`: paired week-block 95% interval wholly below the full-history baseline. Percent is vs the full-history per-type baseline (negative = better).")
open(os.path.join(here, "..", "results", "m7_table.md"), "w").write("\n".join(out) + "\n")
