"""Thin wrappers around Yosys, Icarus Verilog and Verilator."""
import re
import shutil
import subprocess
from pathlib import Path

DESIGNS = Path(__file__).resolve().parents[2] / "designs"

# Generic gate library handed to ABC. No technology library is involved, so areas
# are gate counts, not square microns.
GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"


def have(tool):
    return shutil.which(tool) is not None


def _run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, check=True, **kw)


def tool_versions():
    """Version strings of the tools, or None when a tool is missing."""
    out = {}
    if have("yosys"):
        out["yosys"] = _run(["yosys", "-V"]).stdout.strip()
    if have("iverilog"):
        out["iverilog"] = _run(["iverilog", "-V"]).stdout.splitlines()[0].strip()
    if have("verilator"):
        out["verilator"] = _run(["verilator", "--version"]).stdout.strip()
    return out


def synth_stats(file, top, params=None):
    """Synthesise `top` to the generic gate library; return cell counts and depth.

    `params` maps parameter names to integers (Yosys `chparam`).
    `depth` is the longest combinational path in cells from `ltp -noff`.
    """
    chp = "".join(f"chparam -set {k} {v} {top}; " for k, v in (params or {}).items())
    script = (f"read_verilog {file}; {chp} hierarchy -top {top}; "
              f"synth -top {top} -flatten; abc -g {GATES}; opt_clean; "
              f"tee -o /dev/stdout stat; tee -o /dev/stdout ltp -noff")
    log = _run(["yosys", "-q", "-p", script]).stdout
    cells = {}
    for line in log.splitlines():
        m = re.match(r"\s+(\$\w+)\s+(\d+)\s*$", line)
        if m:
            cells[m.group(1)] = int(m.group(2))
    # `stat` prints "Number of cells:   N"
    m = re.search(r"Number of cells:\s+(\d+)", log)
    total = int(m.group(1)) if m else sum(cells.values())
    m = re.search(r"Longest topological path in \S+ \(length=(\d+)\)", log)
    depth = int(m.group(1)) if m else None
    return {"cells": total, "by_type": cells, "depth": depth}


def simulate(top, files, tmpdir):
    """Compile with Icarus Verilog and run; return the stdout lines."""
    out = Path(tmpdir) / f"{top}.vvp"
    _run(["iverilog", "-g2012", "-s", top, "-o", str(out)] + [str(f) for f in files])
    return _run(["vvp", str(out)]).stdout.splitlines()


def lint(file, top):
    """Run Verilator --lint-only; return (ok, message)."""
    p = subprocess.run(["verilator", "--lint-only", "-Wall", "--top-module", top, str(file)],
                       capture_output=True, text=True)
    return p.returncode == 0, p.stderr.strip()


def equivalent(file_a, top_a, file_b, top_b, params=None):
    """Combinational equivalence of two modules by a Yosys miter and SAT proof.

    Returns True if `sat -prove trigger 0` proves the miter output never fires.
    """
    chp = "".join(f"chparam -set {k} {v} {t}; " for t in (top_a, top_b)
                  for k, v in (params or {}).items())
    script = (f"read_verilog {file_a}; read_verilog {file_b}; {chp} proc; flatten; "
              f"miter -equiv -flatten -make_outputs {top_a} {top_b} miter; "
              f"hierarchy -top miter; sat -verify -prove trigger 0 miter")
    p = subprocess.run(["yosys", "-q", "-p", script], capture_output=True, text=True)
    return p.returncode == 0
