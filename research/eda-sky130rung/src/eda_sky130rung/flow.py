"""SKY130 HD mapping of a design including flip-flops (dfflibmap), so area covers the whole chip.

chip-ppa-sky130mac's `map_sky130` runs only `abc -liberty`; on a sequential design the flip-flops stay unmapped and
have no area. This adds `dfflibmap`. Liberty filtering and the ABC scripts are reused from that project."""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(HERE.parent / "chip-ppa-sky130mac" / "src"))
from chip_ppa_sky130mac import flow as base  # noqa: E402

SCRIPT = "strash; dc2; map; topo; stime"


def parse(stdout):
    """Pull chip area, ABC's combinational delay and the cell counts from Yosys output."""
    area = re.search(r"Chip area for (?:top )?module.*?:\s*([\d.]+)", stdout)
    delay = re.search(r"Delay =\s+([\d.]+) ps", stdout)
    cells = re.findall(r"Number of cells:\s+(\d+)", stdout)
    ff = sum(int(n) for n in re.findall(r"(\d+)\s+\S*sky130_fd_sc_hd__(?:e|s)?df\w*", stdout))
    if not (area and delay and cells):
        raise RuntimeError("could not parse yosys output: " + stdout[-400:])
    return {"area_um2": float(area.group(1)), "delay_ps": float(delay.group(1)), "cells": int(cells[-1]), "ff": ff}


def map_full(verilog_text, top, liberty, script=SCRIPT):
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "a.v").write_text(verilog_text)
        (Path(d) / "s.abc").write_text(script + "\n")
        p = subprocess.run(["yosys", "-p", f"read_verilog {d}/a.v; hierarchy -top {top}; synth -top {top} -flatten -noabc; "
                            f"dfflibmap -liberty {liberty}; abc -liberty {liberty} -script {d}/s.abc; opt_clean -purge; "
                            f"stat -liberty {liberty}"], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr.strip() or p.stdout[-500:])
    return parse(p.stdout)
