"""Run the RTL in Icarus Verilog and synthesise it with Yosys; compare with the integer reference."""
import os
import re
import subprocess
import tempfile

import numpy as np

from . import model

RTL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "rtl")


def _hex(vals, bits):
    mask = (1 << bits) - 1
    nd = (bits + 3) // 4
    return "\n".join(format(int(v) & mask, f"0{nd}x") for v in vals) + "\n"


def write_hex(m, xq, d):
    xq = np.asarray(xq)
    open(os.path.join(d, "x.hex"), "w").write(_hex(xq.reshape(-1), 8))
    open(os.path.join(d, "w1.hex"), "w").write(_hex(m.w1.reshape(-1), m.wbits))  # row j = neuron j
    open(os.path.join(d, "b1.hex"), "w").write(_hex(m.b1, model.ACCW))
    open(os.path.join(d, "w2.hex"), "w").write(_hex(m.w2.reshape(-1), m.wbits))
    open(os.path.join(d, "b2.hex"), "w").write(_hex(m.b2, model.ACCW))


def simulate(m, xq):
    """Returns (classes, cycles, logits) from the RTL for the rows of xq."""
    n = len(xq)
    with tempfile.TemporaryDirectory() as d:
        write_hex(m, xq, d)
        out = os.path.join(d, "sim.vvp")
        params = {"IN": m.inputs, "H": m.hidden, "OUT": model.OUT, "WB": m.wbits, "ACCW": model.ACCW,
                  "S1": m.s1, "N": n}
        cmd = ["iverilog", "-g2012", "-o", out] + [f"-Ptb_kws.{k}={v}" for k, v in params.items()] + [
            os.path.join(RTL_DIR, "tb_kws.v"), os.path.join(RTL_DIR, "kws_engine.v")]
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        res = subprocess.run(["vvp", out], cwd=d, check=True, capture_output=True, text=True).stdout
    cls, cyc, lg = [], [], []
    for line in res.splitlines():
        if line.startswith("R "):
            p = line.split()
            cls.append(int(p[2]))
            cyc.append(int(p[3]))
            lg.append([int(v) for v in p[4:]])
    assert len(cls) == n, res[-500:]
    return np.array(cls), np.array(cyc), np.array(lg)


def synth(m_or_params, script="abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"):
    """Generic-gate synthesis of the engine core (no memories). Returns dict(cells, flops, ...)."""
    if isinstance(m_or_params, model.IntModel):
        m = m_or_params
        p = {"IN": m.inputs, "H": m.hidden, "OUT": model.OUT, "WB": m.wbits, "ACCW": model.ACCW, "S1": m.s1}
    else:
        p = m_or_params
    sets = "; ".join(f"chparam -set {k} {v} kws_engine" for k, v in p.items())
    ys = (f"read_verilog {os.path.join(RTL_DIR, 'kws_engine.v')}; {sets}; hierarchy -top kws_engine; "
          f"synth -flatten -top kws_engine; {script}; tee -o /dev/stdout stat")
    out = subprocess.run(["yosys", "-q", "-p", ys], check=True, capture_output=True, text=True).stdout
    cells = int(re.search(r"Number of cells:\s+(\d+)", out).group(1))
    by = {mm.group(1): int(mm.group(2)) for mm in re.finditer(r"^\s+(\$\w+)\s+(\d+)\s*$", out, re.M)}
    flops = sum(v for k, v in by.items() if "DFF" in k)
    return {"cells": cells, "flops": flops, "by_type": by}
