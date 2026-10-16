"""Run the P-lane engines in Icarus Verilog, synthesise them with Yosys, compare with NumPy and the schedule model."""
import math, os, re, subprocess, sys, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RTL_DIR = os.path.join(HERE, "..", "..", "rtl")
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "accel-dataflow", "src"))
from accel_dataflow import flows  # noqa: E402

WB, ACCW = 4, 24
DESIGNS = {"OS": ("os_engine", "tb_os", {}), "RT": ("rt_engine", "tb_rt", {"PIPE": 0}),
           "RTp": ("rt_engine", "tb_rt", {"PIPE": 1})}


def _hex(vals, bits):
    mask, nd = (1 << bits) - 1, (bits + 3) // 4
    return "\n".join(format(int(v) & mask, f"0{nd}x") for v in vals) + "\n"


def random_problem(O, I, N, seed):
    rng = np.random.default_rng(seed)
    W = rng.integers(-(1 << (WB - 1)), 1 << (WB - 1), (O, I))
    X = rng.integers(-128, 128, (N, I))
    return W, X


def simulate(design, O, I, P, W, X):
    """Returns (cycles per vector, y of shape N x O) from the RTL."""
    mod, tb, extra = DESIGNS[design]
    N = len(X)
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, "x.hex"), "w").write(_hex(X.reshape(-1), 8))
        open(os.path.join(d, "w.hex"), "w").write(_hex(W.reshape(-1), WB))
        out = os.path.join(d, "sim.vvp")
        params = dict(O=O, I=I, P=P, WB=WB, ACCW=ACCW, N=N, **extra)
        cmd = ["iverilog", "-g2012", "-o", out] + [f"-P{tb}.{k}={v}" for k, v in params.items()] + [
            os.path.join(RTL_DIR, tb + ".v"), os.path.join(RTL_DIR, mod + ".v")]
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        res = subprocess.run(["vvp", out], cwd=d, check=True, capture_output=True, text=True).stdout
    cyc, ys = [], []
    for line in res.splitlines():
        if line.startswith("R "):
            p = line.split()
            cyc.append(int(p[2])); ys.append([int(v) for v in p[3:]])
    assert len(cyc) == N, res[-400:]
    return np.array(cyc), np.array(ys)


def model_cycles(design, O, I, P):
    """Cycles of the accel-dataflow schedule model for a batch-1 matrix-vector product."""
    df = "OS" if design == "OS" else "RT"
    return flows.closed_form(df, O, I, 1, P)["cycles"]


def synth(design, O, I, P, script="abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"):
    """Generic-gate synthesis of the engine core (memories external). Returns dict(cells, flops)."""
    mod, _, extra = DESIGNS[design]
    p = dict(O=O, I=I, P=P, WB=WB, ACCW=ACCW, **extra)
    sets = "; ".join(f"chparam -set {k} {v} {mod}" for k, v in p.items())
    ys = (f"read_verilog {os.path.join(RTL_DIR, mod + '.v')}; {sets}; hierarchy -top {mod}; "
          f"synth -flatten -top {mod}; {script}; tee -o /dev/stdout stat")
    out = subprocess.run(["yosys", "-q", "-p", ys], check=True, capture_output=True, text=True).stdout
    cells = int(re.search(r"Number of cells:\s+(\d+)", out).group(1))
    by = {m.group(1): int(m.group(2)) for m in re.finditer(r"^\s+(\$\w+)\s+(\d+)\s*$", out, re.M)}
    return {"cells": cells, "flops": sum(v for k, v in by.items() if "DFF" in k)}
