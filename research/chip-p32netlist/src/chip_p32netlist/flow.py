"""Count cells of the P-lane MAC engine (baseline_gen, copied from chip-macp32cells) after each stage of Yosys `synth` + abc."""
import re
import subprocess
import tempfile
from . import baseline_gen, model

G9 = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"
# stage -> script after read_verilog. "abc" is flow A of chip-macp32cells (what every earlier chip-* project used).
STAGES = {
    "coarse": "synth -top accel -flatten -run :fine",    # word-level cells after opt/alumacc/share
    "fine": "synth -top accel -flatten -run :abc",       # bit-level cells, before abc
    "abc": f"synth -top accel -flatten; abc -g {G9}; opt_clean",
}


def make_q(f, seed, wb=4):
    x, y = model.make_data(0, 400, f)
    return model.quantise(model.train_float(x, y, seed=seed), x, wb)


def stat(verilog, stage):
    """Return {cells, ff, comb, types} after `stage`."""
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/accel.v", "w").write(verilog)
        r = subprocess.run(["yosys", "-q", "-p", f"read_verilog {d}/accel.v; {STAGES[stage]}; tee -o /dev/stdout stat"],
                           capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr or r.stdout)
    cells = int(re.search(r"Number of cells:\s+(\d+)", r.stdout).group(1))
    types = {m.group(1): int(m.group(2)) for m in re.finditer(r"^\s+(\$\w+)\s+(\d+)\s*$", r.stdout, re.M)}
    ff = sum(n for t, n in types.items() if "DFF" in t)
    return {"cells": cells, "ff": ff, "comb": cells - ff, "types": types}


def stages(q, p):
    v = baseline_gen.verilog(q, p)
    return {s: stat(v, s) for s in STAGES}
