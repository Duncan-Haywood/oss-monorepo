"""Figure for milestone 4: what a tolerance-tau referee does to the requester's cost (reads results.json)."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

r = json.load(open(HERE / "results.json"))
rows = [x for x in r["frontier_target"] if x["n_test"] == 540 and x["tau_prime"] <= 0.1]
xs = [x["tau_prime"] for x in rows]
full_score = [r["frontier"][1]["score"]] * len(xs)  # honest target, tolerance > 0, score-only (audit-only is infeasible)
full_audit = [r["frontier"][0]["audit"]] * len(xs)  # honest target, tau = 0
series = [("priced margin target (joint)", xs, [x["joint"] for x in rows]),
          ("full effort, score only", xs, full_score), ("full effort, tau = 0 audit", xs, full_audit)]
write_lines(HERE, "frontier.svg", "Requester cost per unit of honest compute vs tolerance",
            "Line plot of requester cost against the referee tolerance: accepting the margin the tolerance allows costs between 1 and 0.11 compute units; forcing full effort through the score alone costs about 5.8",
            "tolerance tau (referee accepts steps within L2 distance tau)", "total cost / honest compute cost",
            series, logx=True, logy=True)
