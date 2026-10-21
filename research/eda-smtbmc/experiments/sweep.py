"""Depth sweep: wall time of yosys-smtbmc + z3 BMC at increasing depth on two undecided targets (del@122 and one lit@123).
Writes sweep.jsonl. Run: python experiments/sweep.py   (needs the same tools as run.py)"""
import json, os, sys, tempfile
sys.argv = sys.argv[:1] + ["24", "240"]
import smtrun as R

HERE = os.path.dirname(os.path.abspath(__file__))
if __name__ == "__main__":
    ts = [(f"{i}:{t[0]}", t[1], t[2]) for i, t in enumerate(R.D.targets()) if t[1] != "equivalent"]
    gold = R.H.Problem().verilog(R.D.CAND)
    with open(os.path.join(HERE, "sweep.jsonl"), "w") as out:
        for mid, _, text in (ts[0], ts[1]):
            with tempfile.TemporaryDirectory() as d:
                f = R.smt2(gold, text, d)
                for depth in (2, 4, 6, 8, 10, 12, 16, 20):
                    v, s = R.smtbmc(f, ["-t", str(depth)])
                    r = {"id": mid, "depth": depth, "verdict": v, "seconds": round(s, 1)}
                    out.write(json.dumps(r) + "\n"); out.flush(); print(r, flush=True)
                    if v == "timeout": break
