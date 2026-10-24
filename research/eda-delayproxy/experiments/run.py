"""Build the generic gate netlist of each of the 40 eda-harness MAC designs and compute library-free delay proxies on it.
Run: PYTHONPATH=src:../eda-harness/src:../chip-accel/src python experiments/run.py   (needs yosys, numpy; no PDK)"""
import json, subprocess, tempfile
from pathlib import Path
from eda_delayproxy import proxy as P
from eda_harness import harness as H

D = Path(__file__).resolve().parent
GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"
import random
rng = random.Random(1)
SCALES = [{t: 2 ** rng.uniform(-1, 1) for t in P.LE} for _ in range(200)]  # same 200 draws for every design
prob = H.Problem(n_vec=24)
mapped = json.load(open(D.parents[1] / "eda-sky130rung/experiments/mapped.json"))
rows = []
for m in mapped["rows"]:
    v = prob.verilog({"p": m["p"], "wb": m["wb"]})
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/a.v", "w").write(v)
        r = subprocess.run(["yosys", "-q", "-p", f"read_verilog {d}/a.v; hierarchy -top accel; synth -top accel -flatten; "
                            f"abc -g {GATES}; opt_clean; write_json {d}/n.json"], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stderr or r.stdout)
        text = open(f"{d}/n.json").read()
    g, l = P.load(text)
    row = {"p": m["p"], "wb": m["wb"], "delay_ps": m["delay_ps"], "gen_depth": m["gen_depth"], "gates": len(g),
           "max_fanout": P.max_fanout(l)}
    for mode in ("unit", "type", "fanout", "le"):
        row[mode] = P.critical_path(g, l, mode)
    # weight sweep: each gate type's logical-effort delay (real fan-out) scaled by a log-uniform factor in [0.5, 2]
    row["sweep"] = [P.critical_path(g, l, "le", S) for S in SCALES]
    row["types"] = {t: sum(1 for x in g if x[0] == t) for t in sorted({x[0] for x in g})}
    rows.append(row)
    print(row, flush=True)
yv = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
json.dump({"yosys": yv, "n_sweep": len(SCALES), "gates": GATES, "rows": rows}, open(D / "proxies.json", "w"), indent=1)
