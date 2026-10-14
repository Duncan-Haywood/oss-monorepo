"""Yosys wrappers: score area/depth with a generic-gate ABC script, prove equivalence with a miter."""
import re
import subprocess

GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"  # generic library: area = gate count, not um^2


def _yosys(script):
    return subprocess.run(["yosys", "-q", "-p", script], capture_output=True, text=True)


def score(file, top):
    """Return {'cells': N, 'depth': L} after `synth -flatten; abc -g GATES`; depth from `ltp -noff`."""
    p = _yosys(f"read_verilog {file}; hierarchy -top {top}; synth -top {top} -flatten; "
               f"abc -g {GATES}; opt_clean; tee -o /dev/stdout stat; tee -o /dev/stdout ltp -noff")
    if p.returncode:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip())
    m = re.search(r"Number of cells:\s+(\d+)", p.stdout)
    d = re.search(r"Longest topological path in \S+ \(length=(\d+)\)", p.stdout)
    return {"cells": int(m.group(1)) if m else 0, "depth": int(d.group(1)) if d else 0}


def equivalent(ref_file, ref_top, cand_file, cand_top):
    """True iff a Yosys miter + `sat -prove trigger 0` proves the two modules agree on all inputs.

    A candidate that does not parse, or whose ports differ, counts as not equivalent.
    """
    # Both files define the same module name, so load the reference first and rename it.
    script = (f"read_verilog {ref_file}; rename {ref_top} gold_{ref_top}; read_verilog {cand_file}; proc; flatten; "
              f"miter -equiv -flatten -make_outputs gold_{ref_top} {cand_top} miter; "
              f"hierarchy -top miter; sat -verify -prove trigger 0 miter")
    return _yosys(script).returncode == 0
