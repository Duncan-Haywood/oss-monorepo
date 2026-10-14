"""Liberty-based mapping of RTL to SKY130 HD cells with Yosys + ABC, area and delay, and netlist equivalence.

Cell-group filtering is adapted from chip-pnr (same author, MIT); the ABC scripts follow chip-ppa-mac."""
import os
import re
import subprocess
import tempfile
from pathlib import Path

LIB_REL = "orfs/flow/platforms/sky130hd/lib/sky130_fd_sc_hd__tt_025C_1v80.lib"
DONT_USE = re.compile(r"sky130_fd_sc_hd__(lpflow_|probe|fill|tap|decap|diode|conb)")

# name -> ABC script run after Yosys has loaded the liberty file. Every script ends in `map`, then `topo; stime`
# so ABC prints its own area and delay estimate. The resyn2-style script is written from memory of the usual alias.
SCRIPTS = {
    "strash_map": "strash; map",
    "dc2_map": "strash; dc2; map",
    "dch_map": "strash; dch; map",
    "resyn2_map": ("strash; balance; rewrite; refactor; balance; rewrite; rewrite -z; balance; "
                   "refactor -z; rewrite -z; balance; map"),
}


def filtered_liberty(src, dst):
    """Copy a liberty file without the cells ORFS marks dont_use (Yosys 0.33 has no abc -dont_use)."""
    text = Path(src).read_text()
    out, i = [], 0
    for m in re.finditer(r'\n\s*cell\s*\(\s*"?([\w]+)"?\s*\)\s*\{', text):
        if m.start() < i or not DONT_USE.match(m.group(1)):
            continue
        depth, j = 1, m.end()
        while depth:
            c = text[j]
            depth += (c == "{") - (c == "}")
            j += 1
        out.append(text[i:m.start()])
        i = j
    out.append(text[i:])
    Path(dst).write_text("".join(out))


def _yosys(script):
    return subprocess.run(["yosys", "-p", script], capture_output=True, text=True)


def map_sky130(file, top, script_name, liberty, netlist_out=None):
    """Return {'area_um2', 'delay_ps', 'cells'} from ABC's liberty mapping under a script; optionally write the netlist."""
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "s.abc")
        Path(path).write_text(SCRIPTS[script_name] + "; topo; stime\n")
        dump = f"; write_verilog -noattr -noexpr {netlist_out}" if netlist_out else ""
        p = _yosys(f"read_verilog {file}; hierarchy -top {top}; synth -top {top} -flatten -noabc; "
                   f"abc -liberty {liberty} -script {path}; opt_clean -purge{dump}; stat -liberty {liberty}")
    if p.returncode:
        raise RuntimeError(p.stderr.strip() or p.stdout[-500:])
    m = re.search(r"Area =\s+([\d.]+).*?Delay =\s+([\d.]+) ps", p.stdout)
    c = re.search(r"Chip area for module.*?:\s*([\d.]+)", p.stdout)
    n = re.findall(r"Number of cells:\s+(\d+)", p.stdout)
    return {"area_um2": float(c.group(1)), "abc_area": float(m.group(1)), "delay_ps": float(m.group(2)),
            "cells": int(n[-1])}


def equivalent(ref_file, ref_top, cand_file, cand_top, liberty=None):
    """True iff a Yosys miter + `sat -prove trigger 0` proves the modules agree on all inputs.

    With `liberty`, the candidate is a mapped netlist: the liberty file is read as logic models (read_liberty without -lib)."""
    lib = f"read_liberty -ignore_miss_func -ignore_miss_dir {liberty}; " if liberty else ""
    script = (f"read_verilog {ref_file}; rename {ref_top} gold_{ref_top}; {lib}read_verilog {cand_file}; proc; flatten; "
              f"miter -equiv -flatten -make_outputs gold_{ref_top} {cand_top} miter; "
              f"hierarchy -top miter; sat -verify -prove trigger 0 miter")
    return _yosys(script).returncode == 0


def map_checked(ref_file, ref_top, cand_file, cand_top, script_name, liberty):
    """Map under a script, then prove the *mapped netlist* equals the reference. Returns (result, netlist_ok)."""
    with tempfile.TemporaryDirectory() as d:
        net = os.path.join(d, "net.v")
        r = map_sky130(cand_file, cand_top, script_name, liberty, netlist_out=net)
        return r, equivalent(ref_file, ref_top, net, cand_top, liberty)


GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"  # generic library used by chip-ppa-mac: area = gate count


def generic_score(file, top, script_name):
    """chip-ppa-mac's score for the same ABC script: {'cells', 'depth'} in the generic-gate library."""
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "s.abc")
        Path(path).write_text(SCRIPTS[script_name] + "\n")
        # -q: otherwise synth's own pre-ABC `stat` is also printed and the first match would be wrong
        p = subprocess.run(["yosys", "-q", "-p", f"read_verilog {file}; hierarchy -top {top}; synth -top {top} -flatten -noabc; "
                            f"abc -g {GATES} -script {path}; opt_clean; tee -o /dev/stdout stat; tee -o /dev/stdout ltp -noff"],
                           capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr.strip() or p.stdout[-500:])
    m = re.search(r"Number of cells:\s+(\d+)", p.stdout)
    dp = re.search(r"Longest topological path in \S+ \(length=(\d+)\)", p.stdout)
    return {"cells": int(m.group(1)), "depth": int(dp.group(1))}
