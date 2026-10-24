"""Golden-free checks of the `accel` module: five properties that need no reference output, only the spec's
latency (20 cycles for p = 8) and the module's own repeatability. Each returns the set of violated property names."""
import os
import re
import subprocess
import tempfile

import numpy as np

from chip_accel.model import NIN

MAXCYC = 200
NAMES = ("latency", "pulse", "hold", "repeat", "glitch", "abort")


def _tb(wb, runs):
    """`runs` is a list of (mode, vector). mode 0 plain; 1 re-assert start at cycle 5; 2 reset for one cycle at cycle 7,
    then run plain."""
    nin = NIN * wb
    body = "\n".join(f"    run({m}, {nin}'d{sum((int(v) & ((1 << wb) - 1)) << (j * wb) for j, v in enumerate(x))});"
                     for m, x in runs)
    return f"""module tb;
  reg clk = 0, rst = 1, start = 0; reg [{nin}-1:0] x; wire done; wire [{4*wb}-1:0] y;
  integer cyc, extra; reg [{4*wb}-1:0] y0;
  accel dut(clk, rst, start, x, done, y);
  always #5 clk = ~clk;
  task go(input [{nin}-1:0] xin);
    begin @(negedge clk); x = xin; start = 1; @(negedge clk); start = 0; cyc = 1; end
  endtask
  task finish;
    begin
      while (!done && cyc < {MAXCYC}) begin @(negedge clk); cyc = cyc + 1; end
      y0 = y; extra = 0;
      repeat (3) begin @(negedge clk); if (done) extra = extra + 1; end
      $display("OUT %0d %0d %0d %0d", cyc, y0, extra, y == y0);
    end
  endtask
  task run(input integer mode, input [{nin}-1:0] xin);
    begin
      go(xin);
      if (mode == 1) begin
        repeat (4) @(negedge clk); cyc = cyc + 4; x = ~xin; start = 1; @(negedge clk); start = 0; cyc = cyc + 1;
      end
      if (mode == 2) begin
        repeat (6) @(negedge clk); cyc = cyc + 6; rst = 1; @(negedge clk); rst = 0;
        go(xin);
      end
      finish;
    end
  endtask
  initial begin
    repeat (2) @(negedge clk); rst = 0;
{body}
    $finish;
  end
endmodule
"""


def vectors(wb, n=32, rep=8, seed=0):
    rng = np.random.default_rng(seed)
    lo, hi = -(1 << (wb - 1)), (1 << (wb - 1)) - 1
    xs = rng.integers(lo, hi + 1, (n, NIN))
    # plain runs, then the first `rep` again with a start glitch, again with a reset abort, and once more plain
    return [(0, x) for x in xs] + [(1, x) for x in xs[:rep]] + [(2, x) for x in xs[:rep]] + [(0, x) for x in xs[:rep][::-1]]


def violated(verilog, wb, latency, n=32, rep=8, seed=0, timeout=20):
    """Run the property testbench on `verilog`; return the sorted list of violated property names.
    A compile failure raises RuntimeError; a hang counts as violating every property."""
    runs = vectors(wb, n, rep, seed)
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/a.v", "w").write(verilog); open(f"{d}/tb.v", "w").write(_tb(wb, runs))
        r = subprocess.run(["iverilog", "-g2012", "-o", f"{d}/s", f"{d}/a.v", f"{d}/tb.v"], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stderr)
        try:
            out = subprocess.run(["vvp", f"{d}/s"], capture_output=True, text=True, timeout=timeout).stdout
        except subprocess.TimeoutExpired:
            return sorted(NAMES)
    rows = [tuple(int(t) for t in m) for m in re.findall(r"OUT (\d+) (\d+) (\d+) (\d+)", out)]
    if len(rows) < len(runs):
        return sorted(NAMES)
    bad = set()
    for (mode, _), (cyc, _, extra, stable) in zip(runs, rows):
        if cyc != latency:           # also the glitch and abort runs: latency is counted from the last accepted start
            bad.add("latency" if mode == 0 else {1: "glitch", 2: "abort"}[mode])
        if extra:
            bad.add("pulse")
        if not stable:
            bad.add("hold")
    for i, row in enumerate(rows[n:]):
        mode, k = runs[n + i][0], (i % rep if i < 2 * rep else rep - 1 - (i - 2 * rep))
        if row[1] != rows[k][1]:
            bad.add({0: "repeat", 1: "glitch", 2: "abort"}[mode])
    return sorted(bad)
