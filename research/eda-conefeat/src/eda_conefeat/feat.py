"""Structural features of a mutant, from Yosys, that do not depend on where in the file the mutation sits.

For each mutant we synthesize the golden design and the mutant with the same front end as `eda-verify`'s
formal stage (proc; flatten; memory_map; opt) followed by `synth`, read `stat`, and build the same miter the
bounded check uses to count what the solver would face.
"""
import re
import subprocess
import tempfile

PREP = "read_verilog {g}; read_verilog {m}; proc; flatten; memory_map; opt; "
CELLS = re.compile(r"Number of cells:\s+(\d+)")
ROW = re.compile(r"^\s+(\$\w+)\s+(\d+)\s*$", re.M)


def _run(script, timeout=120):
    r = subprocess.run(["yosys", "-p", script], capture_output=True, text=True, timeout=timeout)
    if r.returncode:
        raise RuntimeError(r.stderr[-300:])
    return r.stdout


def _stat(out):
    """Last `stat` block: (total cells, {type: count})."""
    last = out[out.rfind("Number of cells"):]
    return int(CELLS.search(last).group(1)), {t: int(n) for t, n in ROW.findall(last)}


def synth_cells(verilog, top="accel"):
    with tempfile.TemporaryDirectory() as d:
        f = f"{d}/a.v"
        open(f, "w").write(verilog)
        out = _run(f"read_verilog {f}; proc; flatten; memory_map; opt; synth -top {top} -flatten; stat")
    return _stat(out)


def miter_cells(gold, mut):
    with tempfile.TemporaryDirectory() as d:
        g, m = f"{d}/g.v", f"{d}/m.v"
        open(g, "w").write(gold.replace("module accel", "module gold"))
        open(m, "w").write(mut.replace("module accel", "module mut"))
        out = _run(PREP.format(g=g, m=m) + "miter -equiv -flatten -make_outputs -ignore_gold_x gold mut mit; "
                   "hierarchy -top mit; opt; stat")
    return _stat(out)[0]


def features(gold, mut, gold_cells):
    """delta: mutant cells minus golden cells after synth. same_types: identical cell-type histogram.
    miter: cells in the miter after opt."""
    n, rows = synth_cells(mut)
    gn, grows = gold_cells
    return {"cells": n, "delta": n - gn, "same_types": rows == grows, "miter": miter_cells(gold, mut)}
