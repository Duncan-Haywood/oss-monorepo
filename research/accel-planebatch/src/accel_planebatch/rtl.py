"""Run the batched P-lane engines in Icarus Verilog, synthesise with Yosys, compare with NumPy and the accel-dataflow model."""
import os, re, subprocess, sys, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RTL_DIR = os.path.join(HERE, "..", "..", "rtl")
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "accel-dataflow", "src"))
from accel_dataflow import flows  # noqa: E402

WB, ACCW = 4, 24
DESIGNS = ("OS", "WS")


def _hex(vals, bits):
    mask, nd = (1 << bits) - 1, (bits + 3) // 4
    return "\n".join(format(int(v) & mask, f"0{nd}x") for v in vals) + "\n"


def random_problem(O, I, B, N, seed):
    """W: O x I int4; X: N problems of B x I int8."""
    rng = np.random.default_rng(seed)
    W = rng.integers(-(1 << (WB - 1)), 1 << (WB - 1), (O, I))
    X = rng.integers(-128, 128, (N, B, I))
    return W, X


def simulate(design, O, I, B, P, W, X):
    """Returns (cycles, weight fetches, activation fetches) per problem, and y of shape N x B x O, from the RTL."""
    N = len(X)
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, "x.hex"), "w").write(_hex(X.reshape(-1), 8))
        open(os.path.join(d, "w.hex"), "w").write(_hex(W.reshape(-1), WB))
        out = os.path.join(d, "sim.vvp")
        params = dict(O=O, I=I, B=B, P=P, WB=WB, ACCW=ACCW, N=N, WS=int(design == "WS"))
        cmd = ["iverilog", "-g2012", "-o", out] + [f"-Ptb_batch.{k}={v}" for k, v in params.items()] + [
            os.path.join(RTL_DIR, "tb_batch.v"), os.path.join(RTL_DIR, "batch_engine.v")]
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        res = subprocess.run(["vvp", out], cwd=d, check=True, capture_output=True, text=True).stdout
    m, ys = [], []
    for line in res.splitlines():
        if line.startswith("R "):
            p = line.split()
            m.append([int(v) for v in p[2:5]]); ys.append(np.array([int(v) for v in p[5:]]).reshape(B, O))
    assert len(m) == N, res[-400:]
    return np.array(m), np.array(ys)


def model(design, O, I, B, P):
    """Schedule-simulator counts (cycles, w_rd, x_rd) from accel-dataflow; OS and WS as defined there."""
    c, _ = flows.simulate(design, O, I, B, P)
    return c


def synth(design, O, I, B, P, script="abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"):
    """Generic-gate synthesis of the engine core (memories external). Returns dict(cells, flops)."""
    p = dict(O=O, I=I, B=B, P=P, WB=WB, ACCW=ACCW, WS=int(design == "WS"))
    sets = "; ".join(f"chparam -set {k} {v} batch_engine" for k, v in p.items())
    ys = (f"read_verilog {os.path.join(RTL_DIR, 'batch_engine.v')}; {sets}; hierarchy -top batch_engine; "
          f"synth -flatten -top batch_engine; {script}; tee -o /dev/stdout stat")
    out = subprocess.run(["yosys", "-q", "-p", ys], check=True, capture_output=True, text=True).stdout
    cells = int(re.search(r"Number of cells:\s+(\d+)", out).group(1))
    by = {m.group(1): int(m.group(2)) for m in re.finditer(r"^\s+(\$\w+)\s+(\d+)\s*$", out, re.M)}
    return {"cells": cells, "flops": sum(v for k, v in by.items() if "DFF" in k)}
