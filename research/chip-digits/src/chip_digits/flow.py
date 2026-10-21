"""One multiply-accumulate lane (unsigned ab-bit activation x signed wb-bit weight into a wide accumulator):
RTL generation, Icarus check against NumPy dot products, Yosys generic-gate score."""
import re
import subprocess
import tempfile
import numpy as np

GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"  # generic library: area = gate count, not um^2
LEN = 64                                             # longest dot product in the network (layer 1 fan-in)


def accw(wb, ab):
    return wb + ab + int(np.ceil(np.log2(LEN)))


def verilog(wb, ab):
    aw = accw(wb, ab)
    return f"""module lane(input clk, input clr, input [{ab-1}:0] a, input signed [{wb-1}:0] w, output reg signed [{aw-1}:0] acc);
  wire signed [{ab}:0] as = {{1'b0, a}};
  wire signed [{aw-1}:0] prod = as * w;
  always @(posedge clk) acc <= (clr ? {aw}'sd0 : acc) + prod;
endmodule
"""


def simulate(wb, ab, a, w):
    """a: (n, LEN) unsigned ints, w: (n, LEN) signed ints. Returns the lane's n dot products."""
    aw = accw(wb, ab)
    lines = []
    for n in range(len(a)):
        for k in range(LEN):
            lines.append(f"    step({k == 0 and 1 or 0}, {ab}'d{int(a[n][k])}, {wb}'sd{int(w[n][k])});" if w[n][k] >= 0
                         else f"    step({k == 0 and 1 or 0}, {ab}'d{int(a[n][k])}, -{wb}'sd{-int(w[n][k])});")
        lines.append("    @(negedge clk); $display(\"DOT %0d\", acc);")
    tb = f"""module tb;
  reg clk = 0, clr = 0; reg [{ab-1}:0] a; reg signed [{wb-1}:0] w; wire signed [{aw-1}:0] acc;
  lane dut(clk, clr, a, w, acc);
  always #5 clk = ~clk;
  task step(input c, input [{ab-1}:0] ai, input signed [{wb-1}:0] wi);
    begin @(negedge clk); clr = c; a = ai; w = wi; end
  endtask
  initial begin
{chr(10).join(lines)}
    $finish;
  end
endmodule
"""
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/lane.v", "w").write(verilog(wb, ab))
        open(f"{d}/tb.v", "w").write(tb)
        r = subprocess.run(["iverilog", "-g2012", "-o", f"{d}/sim", f"{d}/lane.v", f"{d}/tb.v"], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stderr)
        out = subprocess.run(["vvp", f"{d}/sim"], capture_output=True, text=True).stdout
    return [int(v) for v in re.findall(r"DOT (-?\d+)", out)]


def score(wb, ab):
    """Yosys `synth -flatten; abc -g GATES`: total cells (flip-flops included) and flip-flops."""
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/lane.v", "w").write(verilog(wb, ab))
        r = subprocess.run(["yosys", "-q", "-p", f"read_verilog {d}/lane.v; hierarchy -top lane; synth -top lane -flatten; "
                            f"abc -g {GATES}; opt_clean; tee -o /dev/stdout stat"], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr or r.stdout)
    cells = int(re.search(r"Number of cells:\s+(\d+)", r.stdout).group(1))
    ff = sum(int(n) for n in re.findall(r"(\d+)\s+\$_DFF\w*_", r.stdout))
    return {"cells": cells, "ff": ff}
