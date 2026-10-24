"""Yosys wrappers: score area/depth under a chosen ABC script, prove equivalence with a miter."""
import os
import re
import subprocess
import tempfile

GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"  # generic library: area = gate count, not um^2

# name -> ABC script after the generic-gate library is loaded by Yosys (None = Yosys's own default script)
SCRIPTS = {
    "yosys_default": None,
    "strash_map": "strash; map",
    "dc2_map": "strash; dc2; map",
    "dch_map": "strash; dch; map",
    "resyn2_map": ("strash; balance; rewrite; refactor; balance; rewrite; rewrite -z; balance; "
                   "refactor -z; rewrite -z; balance; map"),
}


def _yosys(script):
    return subprocess.run(["yosys", "-q", "-p", script], capture_output=True, text=True)


def score(file, top, script_name="yosys_default"):
    """Return {'cells': N, 'depth': L} after `synth -noabc; abc -g GATES [-script ...]`; depth from `ltp -noff`."""
    body = SCRIPTS[script_name]
    with tempfile.TemporaryDirectory() as d:
        opt = ""
        if body is not None:
            path = os.path.join(d, "s.abc")
            with open(path, "w") as f:
                f.write(body + "\n")
            opt = f"-script {path}"
        p = _yosys(f"read_verilog {file}; hierarchy -top {top}; synth -top {top} -flatten -noabc; "
                   f"abc -g {GATES} {opt}; opt_clean; tee -o /dev/stdout stat; tee -o /dev/stdout ltp -noff")
    if p.returncode:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip())
    m = re.search(r"Number of cells:\s+(\d+)", p.stdout)
    d = re.search(r"Longest topological path in \S+ \(length=(\d+)\)", p.stdout)
    return {"cells": int(m.group(1)) if m else 0, "depth": int(d.group(1)) if d else 0}


def equivalent(ref_file, ref_top, cand_file, cand_top):
    """True iff a Yosys miter + `sat -prove trigger 0` proves the two modules agree on all inputs."""
    script = (f"read_verilog {ref_file}; rename {ref_top} gold_{ref_top}; read_verilog {cand_file}; proc; flatten; "
              f"miter -equiv -flatten -make_outputs gold_{ref_top} {cand_top} miter; "
              f"hierarchy -top miter; sat -verify -prove trigger 0 miter")
    return _yosys(script).returncode == 0
