"""Milestone 121: where does a design's widest data shifter get its shift amount? (one Yosys elaboration per design, seconds)

For each design, the same word-level elaboration as experiments/struct_guard/features.py (read, chparam, hierarchy, proc, flatten,
opt; no synth; write_json). Take the widest live shift cell ($shl, $shr, $sshl, $sshr, $shift, $shiftx whose data A and amount B both
carry a signal; ties go to the deepest amount) and walk its amount input B backwards through the coarse netlist:
  amount_depth  the longest chain of word-level cells from a module input (or a flip-flop output) to any bit of B; 0 when every bit of
                B is a module input wired straight in (a barrel's or a funnel's s);
  amount_cells  the number of distinct cells in B's input cone.
A cell is one level whatever its width, so an adder is 1 and a W-step priority chain written as a loop is about W. This is a coarse
proxy for "is the amount produced by logic", fixed before any flow run; it is not a gate-level depth.
Designs with no live shift cell get amount_depth None (the muxshl family, which builds the shifter from explicit mux stages).

Writes features.json: {design: {"shift_width": w, "amount_depth": d, "amount_cells": n}} (plus "mux_share" for this milestone's designs,
from struct_guard/features.py unchanged) for the seen designs (struct_guard's 62 plus
milestone 119's and 120's six blind designs each) and this milestone's blind designs (run.py's NEW).

Usage: python3 features.py   (Yosys 0.70 on PATH)
"""
import importlib.util
import json
import sys
import tempfile
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import flow  # noqa: E402

SHIFTS = ("$shl", "$shr", "$sshl", "$sshr", "$shift", "$shiftx")
FF = ("$dff", "$adff", "$sdff", "$dffe", "$adffe", "$sdffe", "$sdffce", "$aldff", "$dlatch")


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def coarse(name, spec):
    stem, top, params, _ = spec
    chp = f"chparam {' '.join(f'-set {k} {v}' for k, v in params.items())} {top}; " if params else ""
    with tempfile.TemporaryDirectory() as wd:
        wd = Path(wd)
        flow._yosys(f"read_verilog -sv {flow.DESIGNS_DIR / (stem + '.v')}; {chp}hierarchy -top {top}; proc; flatten; opt; "
                    f"write_json {wd / 'coarse.json'}", wd / "c.log")
        mods = json.loads((wd / "coarse.json").read_text())["modules"]
    return mods[top] if top in mods else next(iter(mods.values()))


def amount_features(mod):
    cells = mod["cells"]
    driver = {}  # bit -> cell name
    for n, c in cells.items():
        for p, bits in c["connections"].items():
            if c.get("port_directions", {}).get(p) == "output":
                for b in bits:
                    if isinstance(b, int):
                        driver[b] = n

    def inputs(n):
        c = cells[n]
        return [b for p, bits in c["connections"].items() if c.get("port_directions", {}).get(p) == "input"
                for b in bits if isinstance(b, int)]

    @lru_cache(maxsize=None)
    def depth(n):
        if cells[n]["type"] in FF:
            return 0
        return 1 + max([depth(driver[b]) for b in inputs(n) if b in driver] or [0])

    def cone(bits):
        seen, stack = set(), [driver[b] for b in bits if isinstance(b, int) and b in driver]
        while stack:
            n = stack.pop()
            if n in seen or cells[n]["type"] in FF:
                continue
            seen.add(n)
            stack += [driver[b] for b in inputs(n) if b in driver]
        return seen

    live = lambda bits: any(isinstance(b, int) for b in bits)
    sh = [c for c in cells.values() if c["type"] in SHIFTS and live(c["connections"]["A"]) and live(c["connections"]["B"])]
    if not sh:
        return {"shift_width": 0, "amount_depth": None, "amount_cells": None}
    best = None
    for c in sh:
        b = c["connections"]["B"]
        d = max([depth(driver[x]) for x in b if isinstance(x, int) and x in driver] or [0])
        key = (int(c["parameters"]["Y_WIDTH"], 2), d)
        if best is None or key > best[0]:
            best = (key, len(cone(b)))
    (w, d), n = best
    return {"shift_width": w, "amount_depth": d, "amount_cells": n}


def designs():
    defs = json.loads((EXP / "struct_guard" / "seen_designs.json").read_text())
    for sub, nm in (("struct_guard", "m119"), ("shift_power", "m120"), ("amount_depth", "m121")):
        run = _load(EXP / sub / "run.py", f"vdse_{nm}_run_feat")
        defs.update({k: list(v) for k, v in run.NEW.items()})
    return defs


def main():
    out = {}
    sgf = _load(EXP / "struct_guard" / "features.py", "vdse_m119_features")
    m121 = _load(HERE / "run.py", "vdse_m121_run_feat2").NEW
    for k, v in sorted(designs().items()):
        out[k] = amount_features(coarse(k, v))
        if k in m121:  # rung 1's gate mix for this milestone's blind designs (the seen ones are in struct_guard and shift_power)
            out[k]["mux_share"] = sgf.features(k, list(v))["mux_share"]
        print(f"{k:14s} shift_width {out[k]['shift_width']:4d} amount_depth {out[k]['amount_depth']} amount_cells {out[k]['amount_cells']}",
              flush=True)
    (HERE / "features.json").write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
