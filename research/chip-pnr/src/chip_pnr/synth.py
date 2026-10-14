"""Technology mapping with Yosys + ABC against the SKY130 HD liberty file."""
import re
import subprocess
from pathlib import Path

DESIGNS = Path(__file__).resolve().parents[2] / "designs"
DONT_USE = re.compile(r"sky130_fd_sc_hd__(lpflow_|probe|fill|tap|decap|diode|conb)")


def filtered_liberty(src, dst):
    """Copy a liberty file without the cells ORFS marks dont_use (Yosys 0.33 has no abc -dont_use).

    Cell groups are removed by brace matching; everything else is copied unchanged.
    """
    text = Path(src).read_text()
    out, i = [], 0
    for m in re.finditer(r'\n\s*cell\s*\(\s*"?([\w]+)"?\s*\)\s*\{', text):
        if m.start() < i:
            continue
        if not DONT_USE.match(m.group(1)):
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


def synth(top, params, verilog, liberty, period_ns, workdir):
    """Map `top` to the liberty cells. Returns dict with netlist path and yosys `stat -liberty` numbers."""
    wd = Path(workdir)
    wd.mkdir(parents=True, exist_ok=True)
    net = wd / f"{top}.mapped.v"
    sets = " ".join(f"-set {k} {v}" for k, v in params.items())
    chp = f"chparam {sets} {top}\n" if params else ""
    script = f"""read_verilog -sv {verilog}
{chp}hierarchy -top {top}
synth -flatten -top {top}
dfflibmap -liberty {liberty}
abc -D {int(period_ns * 1000)} -liberty {liberty}
hilomap -singleton -hicell sky130_fd_sc_hd__conb_1 HI -locell sky130_fd_sc_hd__conb_1 LO
opt_clean -purge
tee -o {wd / (top + '.stat.txt')} stat -liberty {liberty}
write_verilog -noattr -noexpr {net}
"""
    (wd / f"{top}.ys").write_text(script)
    subprocess.run(["yosys", "-q", "-l", str(wd / f"{top}.yosys.log"), str(wd / f"{top}.ys")],
                   check=True, capture_output=True)
    stat = (wd / f"{top}.stat.txt").read_text()
    area = float(re.search(r"Chip area for (?:top )?module.*?:\s*([\d.]+)", stat).group(1))
    cells = int(re.search(r"Number of cells:\s*(\d+)", stat).group(1))
    return {"netlist": str(net), "synth_area_um2": area, "synth_cells": cells}


GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"


def generic(top, params, verilog, workdir):
    """Technology-free synthesis as in chip-toolchain: gate count and longest path in cells."""
    wd = Path(workdir)
    wd.mkdir(parents=True, exist_ok=True)
    sets = " ".join(f"-set {k} {v}" for k, v in params.items())
    chp = f"chparam {sets} {top}\n" if params else ""
    script = f"""read_verilog -sv {verilog}
{chp}hierarchy -top {top}
synth -flatten -top {top}
abc -g {GATES}
opt_clean -purge
tee -o {wd / (top + '.gen.stat.txt')} stat
ltp -noff
"""
    (wd / f"{top}.gen.ys").write_text(script)
    r = subprocess.run(["yosys", "-q", "-l", str(wd / f"{top}.gen.log"), str(wd / f"{top}.gen.ys")],
                       check=True, capture_output=True, text=True)
    log = (wd / f"{top}.gen.log").read_text()
    stat = (wd / f"{top}.gen.stat.txt").read_text()
    cells = int(re.search(r"Number of cells:\s*(\d+)", stat).group(1))
    m = re.search(r"Longest topological path in \S+ \(length=(\d+)\)", log)
    return {"gen_cells": cells, "gen_depth": int(m.group(1)) if m else None}
