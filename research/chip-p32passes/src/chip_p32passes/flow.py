"""Count cells of the P-lane MAC engine (baseline_gen, copied from chip-macp32cells) after each Yosys pass between `coarse` and `fine`."""
import re
import subprocess
import tempfile
from . import baseline_gen, model

# Reproduces `synth -flatten -run :abc` of Yosys 0.33, which is NOT "stop before abc": that version has no `abc` label,
# so `-run :abc` runs the whole script including `abc -fast` (found here; chip-p32netlist's "fine" stage is this).
HEAD = "synth -top accel -flatten -run :fine"
# (label, pass) in the order the `fine` section of `synth` runs them.
PASSES = [
    ("opt_fast_full", "opt -fast -full"),
    ("memory_map", "memory_map"),
    ("opt_full", "opt -full"),
    ("techmap", "techmap"),
    ("opt_fast", "opt -fast"),          # last pass before abc: the bit-level netlist as techmap and opt leave it
    ("abc_fast", "abc -fast"),          # synth's own abc call (default gate library)
    ("opt_fast_end", "opt -fast"),
]
ONE_SHOT = "synth -top accel -flatten -run :abc"


def make_q(f, seed, wb=4):
    x, y = model.make_data(0, 400, f)
    return model.quantise(model.train_float(x, y, seed=seed), x, wb)


def _cells(out):
    return int(re.search(r"Number of cells:\s+(\d+)", out).group(1))


def _run(verilog, script):
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/accel.v", "w").write(verilog)
        r = subprocess.run(["yosys", "-q", "-p", f"read_verilog {d}/accel.v; {script}"],
                           capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr or r.stdout)
    return r.stdout


def trace(verilog, passes=PASSES):
    """Cells after `coarse` and after each pass in `passes`, as [(label, cells)]. One Yosys run."""
    stat = "tee -o /dev/stdout stat"
    script = f"{HEAD}; {stat}; " + "; ".join(f"{p}; {stat}" for _, p in passes)
    outs = re.split(r"(?=^\s*\d+\. Printing statistics)", _run(verilog, script), flags=re.M)
    counts = [_cells(o) for o in outs if "Number of cells" in o]
    labels = ["coarse"] + [l for l, _ in passes]
    if len(counts) != len(labels):
        raise RuntimeError(f"expected {len(labels)} stat blocks, got {len(counts)}")
    return list(zip(labels, counts))


def one_shot(verilog):
    """Cells after the one-shot `synth -run :abc`."""
    return _cells(_run(verilog, ONE_SHOT + "; tee -o /dev/stdout stat"))
