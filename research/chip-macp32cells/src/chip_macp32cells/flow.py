"""Score the P-lane MAC engine (baseline_gen, copied from chip-systolic-p32) with Yosys under several flows."""
import re
import subprocess
import tempfile
from . import baseline_gen, model

G9 = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"
G4 = "AND,OR,XOR,MUX"
# name -> Yosys script after read_verilog. "A" is the script used by every earlier chip-* project.
FLOWS = {
    "A": f"synth -top accel -flatten; abc -g {G9}; opt_clean",
    "B": f"synth -top accel -flatten; abc -g {G4}; opt_clean",
    "C": f"synth -top accel -flatten; abc -fast -g {G9}; opt_clean",
}


def make_q(f, seed, wb=4):
    x, y = model.make_data(0, 400, f)
    return model.quantise(model.train_float(x, y, seed=seed), x, wb)


def score(q, p, flow="A"):
    """Return cells, flip-flops and combinational cells (cells - ff) for P lanes under the named flow."""
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/accel.v", "w").write(baseline_gen.verilog(q, p))
        r = subprocess.run(["yosys", "-q", "-p", f"read_verilog {d}/accel.v; {FLOWS[flow]}; tee -o /dev/stdout stat"],
                           capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr or r.stdout)
    cells = int(re.search(r"Number of cells:\s+(\d+)", r.stdout).group(1))
    ff = sum(int(n) for n in re.findall(r"\$_S?DFF\w*_\s+(\d+)", r.stdout))
    return {"cells": cells, "ff": ff, "comb": cells - ff}
