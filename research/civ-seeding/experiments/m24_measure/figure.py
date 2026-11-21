"""Figure for milestone 24: lowest recovery across the three families against the number of
villages, by survey design (leave one village out). Reads results.json. Stdlib only."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

R = json.loads((HERE / "results.json").read_text())["recovery"]
LABEL = {"X": "cross-section (X)", "XA": "+ awareness", "XH": "+ timing", "XAH": "+ both",
         "XAn": "+ awareness, misreported"}
G = [10, 20, 43]
series = []
for w, suffix in (("identity", ""), ("sd", ", SD weights")):
    for d in (("X", "XA", "XH", "XAH", "XAn") if w == "identity" else ("X", "XAH")):
        ys = [100 * min(R[w]["loo"][d][str(g)]["recovery"].values()) for g in G]
        series.append((LABEL[d] + suffix, G, ys))
write_lines(HERE, "recovery.svg",
            "Which survey identifies the contagion model? (worst of I, T, R)",
            "Lowest share of synthetic datasets, across the information, threshold and "
            "reinforcement models, whose true model is picked by leave-one-village-out, against "
            "the number of villages, for each survey design",
            "villages surveyed", "lowest recovery across models (%)", series, hline=80)
