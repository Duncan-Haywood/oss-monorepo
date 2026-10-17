"""Run the generated RTL under Icarus against the integer NumPy reference; score area/depth with Yosys."""
import re
import subprocess
import tempfile
import numpy as np
from . import gen
from .model import NIN, NOUT

GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"  # generic library: area = gate count, not um^2


def _tb(wb, xs):
    lines = []
    for x in xs:
        packed = sum((int(v) & ((1 << wb) - 1)) << (j * wb) for j, v in enumerate(x))
        lines.append(f"    run({NIN*wb}'d{packed});")
    return f"""module tb;
  reg clk = 0, rst = 1, start = 0; reg [{NIN*wb}-1:0] x; wire done; wire [{NOUT*wb}-1:0] y;
  integer cyc;
  accel dut(clk, rst, start, x, done, y);
  always #5 clk = ~clk;
  task run(input [{NIN*wb}-1:0] xin);
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


def simulate(q, p, xs):
    """Return (outputs (n,4) signed ints, cycles per inference list) from the RTL."""
    wb = q["wb"]
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/accel.v", "w").write(gen.verilog(q, p))
        open(f"{d}/tb.v", "w").write(_tb(wb, xs))
        r = subprocess.run(["iverilog", "-g2012", "-o", f"{d}/sim", f"{d}/accel.v", f"{d}/tb.v"], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stderr)
        out = subprocess.run(["vvp", f"{d}/sim"], capture_output=True, text=True).stdout
    ys, cs = [], []
    for m in re.finditer(r"OUT (\d+) (\d+)", out):
        cs.append(int(m.group(1)))
        v = int(m.group(2))
        ys.append([((v >> (i * wb)) & ((1 << wb) - 1)) for i in range(NOUT)])
    ys = np.array(ys, dtype=np.int64)
    return np.where(ys >= 1 << (wb - 1), ys - (1 << wb), ys), cs


def score(q, p):
    """Yosys `synth -flatten; abc -g GATES`: total cells (flip-flops included), flip-flops, depth (ltp -noff)."""
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/accel.v", "w").write(gen.verilog(q, p))
        r = subprocess.run(["yosys", "-q", "-p", f"read_verilog {d}/accel.v; hierarchy -top accel; synth -top accel -flatten; "
                            f"abc -g {GATES}; opt_clean; tee -o /dev/stdout stat; tee -o /dev/stdout ltp -noff"],
                           capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr or r.stdout)
    cells = int(re.search(r"Number of cells:\s+(\d+)", r.stdout).group(1))
    ff = sum(int(n) for n in re.findall(r"(\d+)\s+\$_DFF\w*_", r.stdout))
    m = re.search(r"Longest topological path in \S+ \(length=(\d+)\)", r.stdout)
    return {"cells": cells, "ff": ff, "depth": int(m.group(1)) if m else 0}
