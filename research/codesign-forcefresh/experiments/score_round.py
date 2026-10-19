"""Score one round of session-agent proposals and write proposals/scores_roundN.json (and print a table).
Usage: python experiments/score_round.py N"""
import json, os, sys
from multiprocessing import Pool
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_forcefresh import Problem


def one(x):
    return Problem().evaluate(x)


if __name__ == "__main__":
    n = int(sys.argv[1])
    path = os.path.join(HERE, "..", "proposals", "round%d.json" % n)
    designs = json.load(open(path))["designs"]
    with Pool(4) as p:
        recs = p.map(one, designs)
    json.dump(recs, open(os.path.join(HERE, "..", "proposals", "scores_round%d.json" % n), "w"), indent=1)
    print("  w     t     L     v     s   | ok  min  mass  fbrk  F    train test")
    for r in recs:
        print(" ".join("%5.1f" % v for v in r["x"]), "|", "Y" if r["feasible"] else "N", "%4.0f %5.1f %5.1f" % (r["print_min"], r["mass_g"], r["f_break_n"]),
              "%5s %4s %4.2f" % ("-" if r["force_n"] is None else "%.1f" % r["force_n"], "-" if r["train_success"] is None else "%.2f" % r["train_success"], r["success"]))
