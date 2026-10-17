"""The benchmark table: every design in a 80-point space (lanes p x bit width wb x ABC script), evaluated once.

The 40 `abc -g` points are read from `eda-harness`'s committed evaluation log (every one passed lint, bit-exact RTL
simulation and the gate-netlist check there). The 40 `abc -fast -g` points reuse the same Verilog, so RTL correctness
carries over; only Yosys synthesis is re-run for them (`build_table`), and their gate-level simulation is not repeated.
Proposers are then compared offline against the table, which is exactly what the harness would return for each query.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..")
LOG = os.path.join(ROOT, "eda-harness", "experiments", "eval_log.jsonl")
sys.path.insert(0, os.path.join(ROOT, "chip-accel", "src"))
DIMS = {"p": list(range(1, 9)), "wb": [4, 5, 6, 7, 8], "abc": ["gates", "fast"]}
OBJ = ("cells", "cycles", "err")          # all minimised; err = 1 - held-out accuracy of the quantised network


def load_harness_rows():
    rows = {}
    for line in open(LOG):
        r = json.loads(line)
        if r["passed"]:
            rows[(r["cand"]["p"], r["cand"]["wb"])] = r
    return rows


def fast_cells(p, wb):
    """Yosys `synth -flatten; abc -fast -g GATES` on chip-accel's generated Verilog (same flow as chip-accel, `-fast` added)."""
    from chip_accel import flow, gen, model
    xtr, ytr = model.make_data(0, 400)
    q = model.quantise(model.train_float(xtr, ytr), xtr, wb)
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/a.v", "w").write(gen.verilog(q, p))
        r = subprocess.run(["yosys", "-q", "-p", f"read_verilog {d}/a.v; hierarchy -top accel; synth -top accel -flatten; "
                            f"abc -fast -g {flow.GATES}; opt_clean; tee -o /dev/stdout stat; tee -o /dev/stdout ltp -noff"],
                           capture_output=True, text=True)
    cells = int(re.search(r"Number of cells:\s+(\d+)", r.stdout).group(1))
    m = re.search(r"Longest topological path in \S+ \(length=(\d+)\)", r.stdout)
    return cells, int(m.group(1)) if m else 0


def build_table(path):
    rows, out = load_harness_rows(), []
    ver = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
    for (p, wb), r in sorted(rows.items()):
        out.append(dict(p=p, wb=wb, abc="gates", cells=r["cells"], cycles=r["cycles"], depth=r["depth"], err=round(1 - r["int_acc"], 6), yosys=r["versions"]["yosys"]))
        c, dpt = fast_cells(p, wb)
        out.append(dict(p=p, wb=wb, abc="fast", cells=c, cycles=r["cycles"], depth=dpt, err=round(1 - r["int_acc"], 6), yosys=ver))
    with open(path, "w") as f:
        for o in out:
            f.write(json.dumps(o) + "\n")
    return out


def load_table(path):
    return [json.loads(l) for l in open(path)]


class Space:
    """Index-coded view of the table: a design is a tuple of indices into DIMS; evaluate() is a table lookup."""

    def __init__(self, table):
        self.keys = list(DIMS)
        self.sizes = [len(DIMS[k]) for k in self.keys]
        self.t = {tuple(DIMS[k].index(r[k]) for k in self.keys): tuple(float(r[o]) for o in OBJ) for r in table}
        assert len(self.t) == len(table) == 80
        arr = list(self.t.values())
        self.lo = [min(a[i] for a in arr) for i in range(3)]
        self.hi = [max(a[i] for a in arr) for i in range(3)]

    def norm(self, y):
        """Objectives scaled to [0, 1] over the whole table, so each counts equally."""
        return tuple((v - l) / (h - l) for v, l, h in zip(y, self.lo, self.hi))

    def evaluate(self, x):
        return self.norm(self.t[x])

    def all(self):
        return list(self.t)
