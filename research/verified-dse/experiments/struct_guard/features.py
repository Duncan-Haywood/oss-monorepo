"""Milestone 119: structural features of a design that need no flow run beyond one Yosys synthesis (seconds per design).

For each design: two Yosys runs:
  coarse: from a separate word-level elaboration (read, chparam, hierarchy, proc, flatten, opt; no synth; write_json), every
          shift cell ($shl, $shr, $sshl, $sshr, $shift, $shiftx) whose data input A and amount B both carry a signal bit (opt has
          already folded constant amounts into wiring); shift_width = the largest Y_WIDTH among them (0 if none). A decoder
          (1 << s, constant data) and an indexed part-select (a $shiftx whose output is a few bits) are not wide shifters;
  generic: `abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX` with the empty pass sequence (strash; map, rung 1's mapping) and the
           share of each gate type in the netlist; mux_share = MUX cells / all cells, xor_share = (XOR + XNOR) / all cells.
Writes features.json: {design: {"cells": n, "mux_share": f, "xor_share": f, "shift_cells": k, "shift_width": w, "family": ...}}.

Usage: python3 features.py [designs.json]   (yosys on PATH; designs.json maps name -> [stem, top, params, clock port];
       default: every design of the seen tables (seen_designs.json) plus this milestone's blind designs (run.py's NEW))
"""
import importlib.util
import json
import re
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

SHIFTS = ("$shl", "$shr", "$sshl", "$sshr", "$shift", "$shiftx")


def _counts(stat):
    """Cell-type counts from a Yosys `stat` report (0.70 prints `<n> <type>`, 0.33 prints `<type> <n>`)."""
    c = {}
    for line in stat.splitlines():
        m = re.match(r"^\s+(\d+)\s+(?:[\d.]+\s+)?(\$\S+)\s*$", line) or re.match(r"^\s+(\$\S+)\s+(\d+)\s*$", line)
        if m:
            a, b = m.groups()
            n, t = (int(a), b) if a.isdigit() else (int(b), a)
            c[t] = c.get(t, 0) + n
    return c


def features(name, spec):
    flow.DESIGNS[name] = tuple(spec)
    _, front = flow._front(name, None)
    with tempfile.TemporaryDirectory() as wd:
        wd = Path(wd)
        (wd / "e.abc").write_text(flow.script_text(()) + "\n")
        stem, top, params, _ = spec
        chp = f"chparam {' '.join(f'-set {k} {v}' for k, v in params.items())} {top}; " if params else ""
        flow._yosys(f"read_verilog -sv {flow.DESIGNS_DIR / (stem + '.v')}; {chp}hierarchy -top {top}; proc; flatten; opt; "
                    f"write_json {wd / 'coarse.json'}", wd / "c.log")
        mods = json.loads((wd / "coarse.json").read_text())["modules"]
        live = lambda bits: any(isinstance(b, int) for b in bits)
        cells = [c for m in mods.values() for c in m["cells"].values() if c["type"] in SHIFTS]
        width = max([int(c["parameters"]["Y_WIDTH"], 2) for c in cells
                     if live(c["connections"]["A"]) and live(c["connections"]["B"])] or [0])
        flow._yosys(front + f"abc -g {flow.GATES} -script {wd / 'e.abc'}; opt_clean -purge; "
                    f"tee -o {wd / 'gen.stat'} stat", wd / "f.log")
        gen = _counts((wd / "gen.stat").read_text())
    n = sum(gen.values())
    return {"cells": n, "mux_share": round(gen.get("$_MUX_", 0) / n, 4),
            "xor_share": round((gen.get("$_XOR_", 0) + gen.get("$_XNOR_", 0)) / n, 4),
            "shift_cells": len(cells), "shift_width": width, "family": re.sub(r"\d+(x\d+)?$", "", name)}


def main():
    if len(sys.argv) > 1:
        defs = json.loads(Path(sys.argv[1]).read_text())
    else:
        defs = json.loads((HERE / "seen_designs.json").read_text())
        spec = importlib.util.spec_from_file_location("vdse_m119_run", HERE / "run.py")
        run = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(run)
        defs.update({k: list(v) for k, v in run.NEW.items()})
    out = {k: features(k, v) for k, v in sorted(defs.items())}
    (HERE / "features.json").write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
    for k, v in out.items():
        print(f"{k:14s} cells {v['cells']:6d} mux {v['mux_share']:.3f} xor {v['xor_share']:.3f} shift cells {v['shift_cells']:2d} widest {v['shift_width']}")


if __name__ == "__main__":
    main()
