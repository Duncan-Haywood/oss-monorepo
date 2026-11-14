"""Milestone 123: the gate-level depth of a shifter's amount cone (one Yosys 0.70 elaboration and one AND/NOT mapping per design,
seconds; no flow run).

Take the same coarse netlist and the same widest live shift cell as experiments/amount_depth/features.py (unchanged), then cut the
module down to the amount: every output port is dropped, the shift cell is deleted, and the bits on its amount input B become the
only output. Yosys then maps what is left to two-input AND and NOT gates (`techmap; opt; abc -g AND; opt_clean`) and `ltp -noff`
prints the longest path in gates:
  amount_gate_depth  AND or NOT gates on the longest path from a module input (or flip-flop) to any bit of the amount (0 for a pin);
  amount_gates       AND gates in the amount's cone.
Unlike amount_depth, a 32-bit adder counts its carry chain, and a 1-bit increment counts about one gate.
"""
import importlib.util
import json
import re
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


amf = _load(EXP / "amount_depth" / "features.py", "vdse_m121_feat_for_m123")
flow = amf.flow


def widest_shift(mod):
    """The cell amount_features picks: widest Y, ties to the deepest amount (same rule, re-derived to get the cell's name)."""
    cells = mod["cells"]
    driver = {}
    for n, c in cells.items():
        for p, bits in c["connections"].items():
            if c.get("port_directions", {}).get(p) == "output":
                for b in bits:
                    if isinstance(b, int):
                        driver[b] = n
    memo = {}

    def depth(n):
        if n not in memo:
            c = cells[n]
            if c["type"] in amf.FF:
                memo[n] = 0
            else:
                memo[n] = 0  # cycle guard
                ins = [b for p, bits in c["connections"].items() if c.get("port_directions", {}).get(p) == "input"
                       for b in bits if isinstance(b, int)]
                memo[n] = 1 + max([depth(driver[b]) for b in ins if b in driver] or [0])
        return memo[n]

    live = lambda bits: any(isinstance(b, int) for b in bits)
    best = None
    for n, c in cells.items():
        if c["type"] in amf.SHIFTS and live(c["connections"]["A"]) and live(c["connections"]["B"]):
            d = max([depth(driver[x]) for x in c["connections"]["B"] if isinstance(x, int) and x in driver] or [0])
            key = (int(c["parameters"]["Y_WIDTH"], 2), d)
            if best is None or key > best[0]:
                best = (key, n)
    return None if best is None else best[1]


def gate_depth(name, spec):
    stem, top, params, _ = spec
    chp = f"chparam {' '.join(f'-set {k} {v}' for k, v in params.items())} {top}; " if params else ""
    with tempfile.TemporaryDirectory() as wd:
        wd = Path(wd)
        flow._yosys(f"read_verilog -sv {flow.DESIGNS_DIR / (stem + '.v')}; {chp}hierarchy -top {top}; proc; flatten; opt; "
                    f"write_json {wd / 'coarse.json'}", wd / "c.log")
        doc = json.loads((wd / "coarse.json").read_text())
        top_name = top if top in doc["modules"] else next(iter(doc["modules"]))
        mod = doc["modules"][top_name]
        cell = widest_shift(mod)
        if cell is None:
            return {"amount_gate_depth": None, "amount_gates": None}
        bits = mod["cells"][cell]["connections"]["B"]
        del mod["cells"][cell]
        for p in [p for p, v in mod["ports"].items() if v["direction"] == "output"]:
            del mod["ports"][p]
        mod["ports"]["amt_out"] = {"direction": "output", "bits": bits}
        mod["netnames"]["amt_out"] = {"hide_name": 0, "bits": bits, "attributes": {}}
        doc["modules"] = {top_name: mod}
        (wd / "cut.json").write_text(json.dumps(doc))
        flow._yosys(f"read_json {wd / 'cut.json'}; hierarchy -top {top_name}; opt_clean; techmap; opt; abc -g AND; opt_clean; "
                    f"stat; ltp -noff", wd / "g.log")
        log = (wd / "g.log").read_text()
    m = re.findall(r"Longest topological path in \S+ \(length=(\d+)\)", log)
    ands = re.findall(r"(\d+)\s+\$_AND_", log)
    # ltp's length is the number of gates (AND or NOT) on the path; no path at all (the amount is a pin) prints length 0 or nothing
    return {"amount_gate_depth": int(m[-1]) if m else 0, "amount_gates": int(ands[-1]) if ands else 0}
