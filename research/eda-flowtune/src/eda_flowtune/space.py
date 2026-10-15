"""The flow-tuning space and its evaluator. Evaluation is chip-ppa-sky130mac's liberty mapping flow, imported by relative path."""
import sys
from itertools import product
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(HERE.parent / "chip-ppa-sky130mac" / "src"))
from chip_ppa_sky130mac import flow  # noqa: E402

PASSES = ["balance", "rewrite", "rewrite -z", "refactor", "refactor -z", "dc2", "dch"]
MAXLEN = 3
DESIGNS = {  # name -> top module (file designs/<name>.v)
    "mac4": "mac4", "mul6": "mul6", "add12": "add12", "alu8": "alu8",
    "popcnt12": "popcnt12", "sad2": "sad2", "rot8": "rot8", "cmpsel": "cmpsel",
}
LIB = "pdk/orfs/flow/platforms/sky130hd/lib/sky130_fd_sc_hd__tt_025C_1v80.lib"


def script_text(seq):
    """A sequence of passes becomes `strash; <passes>; map`."""
    return "; ".join(["strash"] + list(seq) + ["map"])


def all_sequences(maxlen=MAXLEN):
    out = [()]
    for n in range(1, maxlen + 1):
        out.extend(product(PASSES, repeat=n))
    return out


def key(seq):
    return "|".join(seq)


def unkey(k):
    return tuple(k.split("|")) if k else ()


def evaluate(design, seq, liberty):
    """Area (um^2) x delay (ns) of the design mapped under the sequence; inf if ABC aborts. Delay is ABC's static estimate."""
    name = "seq:" + key(seq)
    flow.SCRIPTS[name] = script_text(seq)
    try:
        r = flow.map_sky130(HERE / "designs" / f"{design}.v", DESIGNS[design], name, str(liberty))
    except RuntimeError:
        return float("inf")
    return r["area_um2"] * r["delay_ps"] / 1000.0


def evaluate_named(design, script_name, liberty):
    """Score under one of chip-ppa-sky130mac's named scripts (e.g. resyn2_map, which is longer than the space allows)."""
    r = flow.map_sky130(HERE / "designs" / f"{design}.v", DESIGNS[design], script_name, str(liberty))
    return r["area_um2"] * r["delay_ps"] / 1000.0
