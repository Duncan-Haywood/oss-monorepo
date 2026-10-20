"""Simulate the P-lane MAC engine RTL (Icarus) against the integer NumPy reference and score it with Yosys.

Trimmed from chip-systolic-hidewide's flow.py (same author, MIT): the systolic-array paths are dropped.
Same Yosys script as chip-accel: `synth -flatten; abc -g <generic gates>`; cells include flip-flops. Gate counts, not um^2.
"""
import re
import subprocess
import tempfile
import numpy as np
from . import baseline_gen
from .model import NOUT

GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"


def _tb(wb, xs):
    nin = len(xs[0])
    lines = []
    for x in xs:
        packed = sum((int(v) & ((1 << wb) - 1)) << (j * wb) for j, v in enumerate(x))
        lines.append(f"    run({nin*wb}'d{packed});")
    return f"""module tb;
  reg clk = 0, rst = 1, start = 0; reg [{nin*wb}-1:0] x; wire done; wire [{NOUT*wb}-1:0] y;
  integer cyc;
  accel dut(clk, rst, start, x, done, y);
  always #5 clk = ~clk;
  task run(input [{nin*wb}-1:0] xin);
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


def simulate(q, p, xs):
    """Run each row of xs (n, F) ints through the P-lane engine. Returns ((n, 4) signed outputs, cycles per run)."""
    wb = q["wb"]
    out = _run(baseline_gen.verilog(q, p), _tb(wb, xs))
    ys, cs = [], []
    for m in re.finditer(r"OUT (\d+) (\d+)", out):
        cs.append(int(m.group(1)))
        v = int(m.group(2))
        ys.append([(v >> (j * wb)) & ((1 << wb) - 1) for j in range(NOUT)])
    ys = np.array(ys, dtype=np.int64)
    return np.where(ys >= 1 << (wb - 1), ys - (1 << wb), ys), cs


def score(q, p):
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/accel.v", "w").write(baseline_gen.verilog(q, p))
        r = subprocess.run(["yosys", "-q", "-p", f"read_verilog {d}/accel.v; hierarchy -top accel; synth -top accel -flatten; "
                            f"abc -g {GATES}; opt_clean; tee -o /dev/stdout stat; tee -o /dev/stdout ltp -noff"],
                           capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr or r.stdout)
    cells = int(re.search(r"Number of cells:\s+(\d+)", r.stdout).group(1))
    m = re.search(r"Longest topological path in \S+ \(length=(\d+)\)", r.stdout)
    return {"cells": cells, "depth": int(m.group(1)) if m else 0}
