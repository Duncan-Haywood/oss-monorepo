"""Write results.txt and results.json from prompts/runs/."""
import json, sys
from pathlib import Path
H = Path(__file__).resolve().parent
sys.path.insert(0, str(H.parent))
from modelcost import METRICS, compare, load

runs = load(H.parents[2] / "prompts" / "runs")
res = [compare(runs, m) for m in METRICS]
raw = {m: {"opus": None, "sonnet": None} for m in METRICS}
import statistics as st
for m in METRICS:
    for k, name in (("claude-opus-5-5", "opus"), ("claude-sonnet-5-5", "sonnet")):
        v = [r[m] for r in runs if r["model"] == k and r[m] is not None]
        raw[m][name] = {"n": len(v), "median": st.median(v)}
out = ["priced runs by Opus or Sonnet: %d (Opus %d)" % (len(runs), sum(r["model"].endswith("opus-5-5") for r in runs)), "",
       "pooled medians (not matched):"]
out += ["  %-14s opus %8.2f (n=%d)  sonnet %8.2f (n=%d)" % (m, raw[m]["opus"]["median"], raw[m]["opus"]["n"],
        raw[m]["sonnet"]["median"], raw[m]["sonnet"]["n"]) for m in METRICS]
out += ["", "matched on date x track (ratio of medians Opus/Sonnet, 95% bootstrap over runs):"]
for r in res:
    out.append("  %-14s %.2fx  [%.2f, %.2f]  strata=%d  n=%d/%d" % (r["metric"], r["ratio"], r["lo"], r["hi"], r["strata"], r["n_opus"], r["n_sonnet"]))
(H / "results.txt").write_text("\n".join(out) + "\n")
(H / "results.json").write_text(json.dumps({"raw": raw, "matched": res}, indent=1) + "\n")
print("\n".join(out))
