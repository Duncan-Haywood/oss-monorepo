"""Drape coefficient against energy above the pooled lowest state, every distinct converged state, one line
per lattice, for each fabric. The dashed vertical line is the registered band, dE = 1e-5 J.

    python3 experiments/m3g_band/figure.py    (reads results.json here; stdlib only)

Numbers are read from results.json, never retyped.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

res = json.loads((HERE / "results.json").read_text())
NAME = {"A": "jersey (A, EA 369 N/m)", "D": "suiting (D, EA 1896 N/m)"}
for f, fname in (("A", "band_jersey.svg"), ("D", "band_suiting.svg")):
    series = []
    for a in ("3.75", "2.5", "1.875"):
        st = res["states"][f"{f} {a}"]
        e0 = st[0]["energy"]
        series.append((f"{a} mm lattice", [1e5 * (r["energy"] - e0) for r in st], [r["dc"] for r in st]))
    write_lines(HERE, fname, f"Cusick states of the {NAME[f]}: drape coefficient against energy",
                f"Every distinct converged Cusick end state of the {NAME[f]} found by own seeds and cross-lattice "
                "transfers, drape coefficient against energy above the lattice's lowest state, per lattice; dashed "
                "line at the registered 1e-5 J band",
                "energy above the lattice's lowest state (1e-5 J)", "drape coefficient", series,
                vline=res["registered_dE"] * 1e5)
