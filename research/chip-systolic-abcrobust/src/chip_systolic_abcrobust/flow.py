"""Simulate generated RTL (Icarus) against the integer NumPy reference and score it with Yosys under a chosen ABC script.

`yosys_default` is the chip-accel script (`synth -flatten; abc -g <generic gates>`), the others replace the abc step as in chip-abc-sweep.
Cells include flip-flops. Gate counts, not um^2.
"""
import re
import subprocess
import os
import tempfile
import numpy as np
from . import baseline_gen, gen
from .model import NOUT

GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"


def _tb(wb, batches):
    NIN = len(batches[0][0])
    lines = []
    for xs in batches:
        packed = sum((int(v) & ((1 << wb) - 1)) << ((i * NIN + j) * wb) for i, x in enumerate(xs) for j, v in enumerate(x))
        lines.append(f"    run({len(xs)*NIN*wb}'d{packed});")
    r = len(batches[0])
    return f"""module tb;
  reg clk = 0, rst = 1, start = 0; reg [{r*NIN*wb}-1:0] x; wire done; wire [{r*NOUT*wb}-1:0] y;
  integer cyc;
  accel dut(clk, rst, start, x, done, y);
  always #5 clk = ~clk;
  task run(input [{r*NIN*wb}-1:0] xin);
    begin
      @(negedge clk); x = xin; start = 1; @(negedge clk); start = 0; cyc = 1;
      while (!done) begin @(negedge clk); cyc = cyc + 1; end
      $display("OUT %0d %0d", cyc, y);
    end
  endtask
  initial begin
    repeat (2) @(negedge clk); rst = 0;
{chr(10).join(lines)}
    $finish;
  end
endmodule
"""


def _run(src, tb):
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/accel.v", "w").write(src)
        open(f"{d}/tb.v", "w").write(tb)
        r = subprocess.run(["iverilog", "-g2012", "-o", f"{d}/sim", f"{d}/accel.v", f"{d}/tb.v"], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stderr)
        return subprocess.run(["vvp", f"{d}/sim"], capture_output=True, text=True).stdout


def simulate(q, c, r, xs, mac_lanes=None):
    """xs: (m*r, F) ints, run as m batches of r. Returns ((m*r, 4) signed outputs, cycles per batch).
    With mac_lanes=P, simulates chip-accel's P-lane MAC engine instead (c and r are ignored, one vector per run)."""
    wb = q["wb"]
    if mac_lanes:
        r = 1
    batches = [xs[i:i + r] for i in range(0, len(xs), r)]
    src = baseline_gen.verilog(q, mac_lanes) if mac_lanes else gen.verilog(q, c, r)
    out = _run(src, _tb(wb, batches))
    ys, cs = [], []
    for m in re.finditer(r"OUT (\d+) (\d+)", out):
        cs.append(int(m.group(1)))
        v = int(m.group(2))
        for i in range(r):
            ys.append([(v >> ((i * NOUT + j) * wb)) & ((1 << wb) - 1) for j in range(NOUT)])
    ys = np.array(ys, dtype=np.int64)
    return np.where(ys >= 1 << (wb - 1), ys - (1 << wb), ys), cs


SCRIPTS = {
    "yosys_default": None,
    "strash_map": "strash; map",
    "dc2_map": "strash; dc2; map",
    "dch_map": "strash; dch; map",
    "resyn2_map": ("strash; balance; rewrite; refactor; balance; rewrite; rewrite -z; balance; "
                   "refactor -z; rewrite -z; balance; map"),
}


def _yosys(src, script_name="yosys_default"):
    body = SCRIPTS[script_name]
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/accel.v", "w").write(src)
        if body is None:
            synth, abc = "synth -top accel -flatten", f"abc -g {GATES}"
        else:
            open(f"{d}/s.abc", "w").write(body + "\n")
            synth, abc = "synth -top accel -flatten -noabc", f"abc -g {GATES} -script {d}/s.abc"
        r = subprocess.run(["yosys", "-q", "-p", f"read_verilog {d}/accel.v; hierarchy -top accel; {synth}; "
                            f"{abc}; opt_clean; tee -o /dev/stdout stat; tee -o /dev/stdout ltp -noff"],
                           capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr or r.stdout)
    cells = int(re.search(r"Number of cells:\s+(\d+)", r.stdout).group(1))
    ff = sum(int(n) for n in re.findall(r"(\d+)\s+\$_DFF\w*_", r.stdout))
    m = re.search(r"Longest topological path in \S+ \(length=(\d+)\)", r.stdout)
    return {"cells": cells, "ff": ff, "depth": int(m.group(1)) if m else 0}


def score(q, c, r, script="yosys_default"):
    return _yosys(gen.verilog(q, c, r), script)


def score_baseline(q, p, script="yosys_default"):
    """chip-accel's P-lane engine (one vector at a time), scored with the identical script."""
    return _yosys(baseline_gen.verilog(q, p), script)
