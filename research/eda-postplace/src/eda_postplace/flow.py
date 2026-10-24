"""Map a design with Yosys + ABC, then place it with the OpenROAD wheel and read the numbers back."""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(HERE.parent / "eda-clocksweep" / "src"))
from eda_clocksweep import sweep as S  # noqa: E402

DRIVER = Path(__file__).with_name("or_driver.py")


def netlist(verilog_text, top, liberty, period_ps, out_path):
    """Yosys synth + dfflibmap + ABC (the clocksweep script for `period_ps`), write the mapped Verilog netlist."""
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "a.v").write_text(verilog_text)
        (Path(d) / "s.abc").write_text(S.script(period_ps) + "\n")
        p = subprocess.run(["yosys", "-p", f"read_verilog {d}/a.v; hierarchy -top {top}; synth -top {top} -flatten -noabc; "
                            f"dfflibmap -liberty {liberty}; abc -liberty {liberty} -script {d}/s.abc; opt_clean -purge; "
                            f"write_verilog -noattr {out_path}; stat -liberty {liberty}"], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr.strip() or p.stdout[-500:])
    return S.F.parse(p.stdout)


def parse_log(text, period_ns):
    """STAGE blocks -> area (um^2), worst slack (ns) and implied period (period - slack) per stage."""
    parts = re.split(r"^STAGE (\w+)\n", text, flags=re.M)
    out = {}
    for i in range(1, len(parts), 2):
        name, blk = parts[i], parts[i + 1]
        out[f"{name}_area"] = float(re.search(r"Design area ([\d.]+) u\^2", blk).group(1))
        wns = float(re.search(r"worst slack max (-?[\d.]+)", blk).group(1))
        out[f"{name}_wns"] = wns
        out[f"{name}_period_ns"] = round(period_ns - wns, 3)
    if not {"netlist", "placed", "repaired"} <= {k.split("_")[0] for k in out}:
        raise RuntimeError("OpenROAD log missing a stage: " + text[-400:])
    return out


def place(netlist_path, top, period_ns, liberty, plat, python, util=40):
    """Run or_driver.py under `python` (an interpreter with the openroad wheel) and parse its log."""
    p = subprocess.run([python, str(DRIVER), str(plat), str(liberty), str(netlist_path), top, str(period_ns), str(util)],
                       capture_output=True, text=True, env=dict(os.environ))
    if p.returncode:
        raise RuntimeError(f"openroad driver exit {p.returncode}: {(p.stderr or p.stdout)[-500:]}")
    return parse_log(p.stdout, period_ns)
