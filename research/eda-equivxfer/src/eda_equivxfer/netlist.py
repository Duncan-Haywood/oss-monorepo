"""A design-independent, cheap, pre-formal feature of a mutant: does it synthesise to the same netlist as the golden design?

`signature` runs the same Yosys script as chip-systolic and chip-accel (`synth -flatten; abc -g <generic gates>`) and
returns the cell count by type. Two designs with the same signature are not proven equivalent (different wiring can give
equal counts); two designs with different signatures may still be equivalent (resynthesis can reshape equal logic).
The question this module serves is how often the first reads as the second in practice.
"""
import os
import re
import subprocess
import tempfile
import time

GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"
SCRIPT = ("read_verilog {f}; hierarchy -top accel; synth -top accel -flatten; abc -g " + GATES +
          "; opt_clean; tee -o /dev/stdout stat")


def parse_stat(text):
    """Cell counts by type from a Yosys `stat` report."""
    return {m.group(1): int(m.group(2)) for m in re.finditer(r"^\s+(\$_\w+_)\s+(\d+)\s*$", text, re.M)}


def signature(verilog, timeout=300):
    """(cell counts by type, seconds), or (None, seconds) if Yosys fails or times out."""
    t = time.perf_counter()
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "a.v")
        open(f, "w").write(verilog)
        try:
            r = subprocess.run(["yosys", "-q", "-p", SCRIPT.format(f=f)], capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return None, time.perf_counter() - t
    if r.returncode:
        return None, time.perf_counter() - t
    return parse_stat(r.stdout), time.perf_counter() - t


def delta(gold, mut):
    """Signed change in total cells, or None if either failed."""
    if gold is None or mut is None:
        return None
    return sum(mut.values()) - sum(gold.values())
