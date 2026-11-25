"""Figure for milestone 6ag: the recipe's gain T_r (recipe stopped at round r minus uncompressed, seed mean over eight
seeds) on the training-text and fresh validation batches, every round. Reads trace_6ag.jsonl; stdlib only.
Usage: python3 trace_6ag_figure.py   (writes trace_6ag.svg)"""
import json, os, sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, str(Path(HERE).resolve().parents[2] / "_shared"))
from linefig import write_lines

recs = {(r["noise"], r["seed"]): r["trace"] for r in map(json.loads, open(os.path.join(HERE, "trace_6ag.jsonl")))}
seeds = sorted(s for n, s in recs if n == "unc" and ("rk4", s) in recs)
R = len(recs[("unc", seeds[0])])
xs = list(range(1, R + 1))
T = lambda k: [sum(recs[("rk4", s)][i][f"clean_{k}"] - recs[("unc", s)][i][f"clean_{k}"] for s in seeds) / len(seeds) for i in range(R)]
write_lines(HERE, "trace_6ag.svg",
            "DiLoCo, H = 64: compress every sync but the last (rand-k keep 1/4) minus uncompressed",
            "Seed-mean loss difference of the recipe stopped at each round against uncompressed training, eight seeds: "
            "below zero from round 2, largest near round 12, shrinking to about -0.015 by round 60.",
            "round (sync) at which the run stops with a dense sync", "loss difference (nats)",
            [("training-text batches", xs, T("train")), ("fresh validation batches", xs, T("fresh"))],
            hline=0, xticks=[1, 10, 20, 30, 40, 50, 60])
