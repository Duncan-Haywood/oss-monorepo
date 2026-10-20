"""Run Yosys: word-level features before synthesis (cheap) and generic-gate cell count after synthesis (the target)."""
import json
import os
import re
import subprocess
import tempfile
import time

KINDS = ["mul", "add", "sub", "cmp", "mux", "pmux", "shift", "logic", "ff", "other"]
_MAP = {"$mul": "mul", "$add": "add", "$sub": "sub", "$lt": "cmp", "$le": "cmp", "$gt": "cmp", "$ge": "cmp",
        "$eq": "cmp", "$ne": "cmp", "$mux": "mux", "$pmux": "pmux", "$shl": "shift", "$shr": "shift", "$sshl": "shift",
        "$sshr": "shift", "$and": "logic", "$or": "logic", "$xor": "logic", "$not": "logic", "$logic_not": "logic",
        "$reduce_or": "logic", "$reduce_and": "logic", "$dff": "ff", "$adff": "ff", "$dffe": "ff"}


def _bits(s):
    return int(s, 2)


def version():
    return subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()


def _yosys(script, v):
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "top.v")
        open(f, "w").write(v)
        r = subprocess.run(["yosys", "-q", "-p", script.replace("{f}", f).replace("{d}", d)],
                           capture_output=True, text=True, timeout=600)
        if r.returncode:
            raise RuntimeError(r.stderr[-400:])
        return d, r


def features(v):
    """Word-level features from the design after `proc; opt`: per-kind cell counts and size measures.

    mul_area = sum of A_WIDTH*B_WIDTH over $mul; add_bits = sum of Y_WIDTH over $add/$sub; etc. No gate-level synthesis.
    """
    t0 = time.time()
    with tempfile.TemporaryDirectory() as d:
        f, j = os.path.join(d, "top.v"), os.path.join(d, "top.json")
        open(f, "w").write(v)
        r = subprocess.run(["yosys", "-q", "-p", f"read_verilog {f}; hierarchy -top top; proc; opt -fast; write_json {j}"],
                           capture_output=True, text=True, timeout=600)
        if r.returncode:
            raise RuntimeError(r.stderr[-400:])
        mod = json.load(open(j))["modules"]["top"]
    feat = {f"n_{k}": 0 for k in KINDS}
    feat.update({f"bits_{k}": 0 for k in KINDS})
    feat["mul_area"] = 0
    for c in mod["cells"].values():
        k = _MAP.get(c["type"], "other")
        pr = c["parameters"]
        y = _bits(pr.get("Y_WIDTH", pr.get("WIDTH", "0")))
        feat[f"n_{k}"] += 1
        feat[f"bits_{k}"] += y
        if k == "mul":
            feat["mul_area"] += _bits(pr["A_WIDTH"]) * _bits(pr["B_WIDTH"])
    ports = mod["ports"]
    feat["in_bits"] = sum(len(p["bits"]) for p in ports.values() if p["direction"] == "input")
    feat["out_bits"] = sum(len(p["bits"]) for p in ports.values() if p["direction"] == "output")
    feat["n_cells"] = len(mod["cells"])
    return feat, time.time() - t0


GATES = "AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX"


def synth(v):
    """Generic-gate synthesis (flatten, ABC to a fixed gate set). Returns (cells, flip_flops, seconds)."""
    t0 = time.time()
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "top.v")
        open(f, "w").write(v)
        r = subprocess.run(["yosys", "-p", f"read_verilog {f}; synth -top top -flatten; abc -g {GATES}; opt_clean; stat"],
                           capture_output=True, text=True, timeout=900)
        if r.returncode:
            raise RuntimeError(r.stderr[-400:])
    tail = r.stdout[r.stdout.rfind("=== top ==="):]
    cells = int(re.search(r"Number of cells:\s+(\d+)", tail).group(1))
    m = re.search(r"\$_DFF_P_\s+(\d+)", tail)
    return cells, (int(m.group(1)) if m else 0), time.time() - t0
