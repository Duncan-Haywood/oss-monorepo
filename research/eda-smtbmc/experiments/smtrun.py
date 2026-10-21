"""Stronger formal check of the 10 eda-deepdraw survivors that Yosys' own SAT/induction left undecided.

For each target (formal != "equivalent"): build the golden/mutant miter with Yosys, set undefined register inits to 0
(as eda-verify's `sat -set-init-zero` did), export SMT2 and run yosys-smtbmc with z3: bounded model check to depth
DEPTH (default 24, one inference is 20 cycles) and k-induction with the same z3. Writes smt.jsonl next to this file.
Needs yosys (apt) and z3 (apt). Run with the interpreter that imports numpy.

    python experiments/smtrun.py [DEPTH] [TIMEOUT_S]
"""
import json, os, subprocess, sys, tempfile, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "..", "..")
sys.path[:0] = [os.path.join(R, "eda-deepdraw", "experiments"), os.path.join(R, "eda-verify", "src"),
                os.path.join(R, "chip-accel", "src"), os.path.join(R, "eda-harness", "src")]
import run as D                                  # noqa: E402  (eda-deepdraw's run.py)
from eda_harness import harness as H             # noqa: E402

DEPTH = int(sys.argv[1]) if len(sys.argv) > 1 else 24
TMO = int(sys.argv[2]) if len(sys.argv) > 2 else 900


def smt2(gold, mut, d):
    g, m = f"{d}/g.v", f"{d}/m.v"
    open(g, "w").write(gold.replace("module accel", "module gold"))
    open(m, "w").write(mut.replace("module accel", "module mut"))
    s = (f"read_verilog {g}; read_verilog {m}; proc; flatten; memory_map; opt; "
         "miter -equiv -flatten -make_assert -ignore_gold_x gold mut mit; hierarchy -top mit; opt; "
         f"setundef -zero -init; async2sync; dffunmap; write_smt2 -wires {d}/mit.smt2")
    r = subprocess.run(["yosys", "-q", "-p", s], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-400:]
    return f"{d}/mit.smt2"


def smtbmc(f, args):
    t = time.perf_counter()
    try:
        r = subprocess.run(["yosys-smtbmc", "-s", "z3", "--dump-vcd", "/dev/null", *args, f], capture_output=True,
                           text=True, timeout=TMO)
    except subprocess.TimeoutExpired:
        return "timeout", time.perf_counter() - t
    out = r.stdout + r.stderr
    if "Status: PASSED" in out: v = "pass"
    elif "Status: FAILED" in out or "BMC failed" in out or "Assert failed" in out: v = "fail"
    else: v = "error:" + out[-200:].replace("\n", " ")
    return v, time.perf_counter() - t


def check(args):
    mid, formal, text = args
    gold = H.Problem().verilog(D.CAND)
    with tempfile.TemporaryDirectory() as d:
        f = smt2(gold, text, d)
        b, tb = smtbmc(f, ["-t", str(DEPTH)])
        i, ti = smtbmc(f, ["-i", "-t", str(DEPTH)]) if b == "pass" else ("skipped", 0.0)
    return {"id": mid, "formal_before": formal, "bmc": b, "bmc_s": round(tb, 1), "induct": i, "induct_s": round(ti, 1),
            "depth": DEPTH}


if __name__ == "__main__":
    ts = [(f"{i}:{t[0]}", t[1], t[2]) for i, t in enumerate(D.targets()) if t[1] != "equivalent"]
    print(len(ts), "targets", flush=True)
    with Pool(min(4, len(ts))) as p, open(os.path.join(HERE, "smt.jsonl"), "w") as out:
        for r in p.imap_unordered(check, ts):
            out.write(json.dumps(r) + "\n"); out.flush(); print(r, flush=True)
