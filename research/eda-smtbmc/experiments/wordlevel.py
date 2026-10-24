"""Word-level encoding: same miter as sweep.py but without memory_map, so the ROM stays an SMT array and the multiplier a
bit-vector multiply (write_smt2 without -wires). Depth sweep with z3 on the same two targets. Writes wordlevel.jsonl.
Run: python experiments/wordlevel.py   (same tools as smtrun.py; about 15 min worst case)"""
import json, os, subprocess, sys, tempfile
sys.argv = sys.argv[:1] + ["24", "240"]
import smtrun as R

HERE = os.path.dirname(os.path.abspath(__file__))


def smt2_word(gold, mut, d):
    open(f"{d}/g.v", "w").write(gold.replace("module accel", "module gold"))
    open(f"{d}/m.v", "w").write(mut.replace("module accel", "module mut"))
    s = (f"read_verilog {d}/g.v; read_verilog {d}/m.v; proc; flatten; opt; "
         "miter -equiv -flatten -make_assert -ignore_gold_x gold mut mit; hierarchy -top mit; opt; "
         f"setundef -zero -init; async2sync; dffunmap; write_smt2 {d}/w.smt2")
    r = subprocess.run(["yosys", "-q", "-p", s], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-400:]
    return f"{d}/w.smt2"


if __name__ == "__main__":
    ts = [(f"{i}:{t[0]}", t[1], t[2]) for i, t in enumerate(R.D.targets()) if t[1] != "equivalent"]
    gold = R.H.Problem().verilog(R.D.CAND)
    with open(os.path.join(HERE, "wordlevel.jsonl"), "w") as out:
        for mid, _, text in (ts[0], ts[1]):
            with tempfile.TemporaryDirectory() as d:
                f = smt2_word(gold, text, d)
                for depth in (1, 2, 3, 4, 6, 8):
                    v, s = R.smtbmc(f, ["-t", str(depth)])
                    r = {"id": mid, "depth": depth, "verdict": v, "seconds": round(s, 1)}
                    out.write(json.dumps(r) + "\n"); out.flush(); print(r, flush=True)
                    if v == "timeout": break
