"""Yosys wrappers: score under a chosen ABC script, prove equivalence of RTL, and of the mapped netlist (from chip-ppa-script; memory_map added)."""
import os
import re
import subprocess
import tempfile

GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"  # generic library: area = gate count, not um^2

# name -> ABC script run after Yosys loads the generic-gate library (None = Yosys's own default script).
# The resyn2-style sequence is written from memory of the usual ABC alias, as in chip-abc-sweep.
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


def score(file, top, script_name="yosys_default", netlist_out=None):
    """Return {'cells', 'depth'} after `synth -noabc; abc -g GATES [-script ...]`; optionally write the mapped netlist."""
    body = SCRIPTS[script_name]
    with tempfile.TemporaryDirectory() as d:
        opt = ""
        if body is not None:
            path = os.path.join(d, "s.abc")
            with open(path, "w") as f:
                f.write(body + "\n")
            opt = f"-script {path}"
        dump = f"; write_verilog -noattr {netlist_out}" if netlist_out else ""
        p = _yosys(f"read_verilog {file}; hierarchy -top {top}; synth -top {top} -flatten -noabc; "
                   f"abc -g {GATES} {opt}; opt_clean{dump}; tee -o /dev/stdout stat; tee -o /dev/stdout ltp -noff")
    if p.returncode:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip())
    m = re.search(r"Number of cells:\s+(\d+)", p.stdout)
    d = re.search(r"Longest topological path in \S+ \(length=(\d+)\)", p.stdout)
    return {"cells": int(m.group(1)) if m else 0, "depth": int(d.group(1)) if d else 0}


def equivalent(ref_file, ref_top, cand_file, cand_top):
    """True iff a Yosys miter + `sat -prove trigger 0` proves the two modules agree on all inputs."""
    script = (f"read_verilog {ref_file}; rename {ref_top} gold_{ref_top}; read_verilog {cand_file}; proc; memory_map; flatten; "
              f"miter -equiv -flatten -make_outputs gold_{ref_top} {cand_top} miter; "
              f"hierarchy -top miter; sat -verify -prove trigger 0 miter")
    return _yosys(script).returncode == 0


def score_checked(ref_file, ref_top, cand_file, cand_top, script_name):
    """Score under a script, then prove the *mapped netlist* equals the reference. Returns (score, netlist_ok)."""
    with tempfile.TemporaryDirectory() as d:
        net = os.path.join(d, "net.v")
        sc = score(cand_file, cand_top, script_name, netlist_out=net)
        return sc, equivalent(ref_file, ref_top, net, cand_top)
