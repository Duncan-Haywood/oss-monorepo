"""Where the jersey's transferred states end up: energy above the target lattice's lowest own seed, every
transfer sorted, for 3e's nearest-fill transfer and 3f's affine transfer (capped transfers included at
their capped energy). The dashed line is the widest own-seed band of the three lattices plus 1e-5 J (the flag bound), in 1e-5 J.

    python3 experiments/m3f_transfer/figure.py    (reads results.json here and 3e's; stdlib only)

Numbers are read from results.json, never retyped.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

new = json.loads((HERE / "results.json").read_text())
old = json.loads((HERE.parent / "m3e_pooled" / "results.json").read_text())
EA = 369.0
own = [r for r in old["rows"] if r["f"] == "A" and r["ea"] == EA and r["conv"]]
lo = {a: min(r["energy"] for r in own if r["a"] == a) for a in {r["a"] for r in own}}
band = max(max(r["energy"] for r in own if r["a"] == a) - lo[a] for a in lo)


def excess(rows):
    return sorted(1e5 * (r["energy"] - lo[r["a"]]) for r in rows)


s_old = excess([r for r in old["transfers"] if r["f"] == "A"])
s_new = excess(new["transfers"])
write_lines(HERE, "transfer_excess_energy.svg",
            "Jersey transfers: energy above the target's lowest own seed",
            "Sorted end energies of the 42 jersey cross-lattice transfers above the target lattice's lowest "
            "own seed, for milestone 3e's nearest-node rim fill and milestone 3f's affine rim extension",
            "transfer, sorted", "energy above lowest own seed (1e-5 J)",
            [("3e nearest-node rim fill", list(range(1, len(s_old) + 1)), s_old),
             ("3f affine rim extension", list(range(1, len(s_new) + 1)), s_new)],
            hline=1e5 * band + 1.0)
