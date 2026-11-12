"""Line plot from results_aclin.json: how many of the 12 PGLib API cases have an AC-feasible dispatch
after k rounds of successive linearisation (C), round 0 being plain DC. Two counts: clean by the AC
check's own test (no branch over 100 %, slack in its limits) and near-clean (worst branch at most
100.1 %, slack within 1 MW of its limits; a descriptive tolerance chosen after the run).
Writes experiments/aclin_rounds.svg. Stdlib only."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

rows = [r for r in json.loads((HERE / "results_aclin.json").read_text()) if r["kind"] == "api"]
ROUNDS = 10


def near(c):
    return c["max_load"] <= 1.001 and c["slack_out_mw"] <= 1.0


def counts(test):
    out = []
    for k in range(ROUNDS + 1):
        n = 0
        for r in rows:
            seen = ([r["plain"]] if r["plain"] else []) + [h for h in r.get("C", []) if h["it"] <= k and "n_over" in h]
            n += any(test(c) for c in seen)
        out.append(n)
    return out


xs = list(range(ROUNDS + 1))
series = [("clean (AC check)", xs, counts(lambda c: c["clean"])),
          ("within 0.1 % and 1 MW", xs, counts(near))]
write_lines(HERE, "aclin_rounds.svg",
            "PGLib API cases: AC-feasible after k rounds of successive linearisation",
            "Line plot: of 12 congested PGLib-OPF cases, none is clean under plain DC (round 0) or one linearisation "
            "(round 1); successive linearisation reaches 7 clean by round 7 and 11 within 0.1 percent and 1 MW",
            "round (0 = plain DC dispatch, 1 = one linearisation at it)", "cases (of 12)", series)
