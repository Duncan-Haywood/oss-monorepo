"""Milestone 122: amount_depth, amount_cells and rung 1's mux_share for this milestone's six blind designs (one Yosys 0.70 elaboration
per design and one generic-gate mapping, seconds; no flow run). Uses experiments/amount_depth/features.py's `coarse` and
`amount_features` and experiments/struct_guard/features.py's `features`, unchanged. The seen designs' features stay in
experiments/amount_depth/features.json.

Usage: python3 features.py   (Yosys 0.70 on PATH)
"""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    amf = _load(EXP / "amount_depth" / "features.py", "vdse_m121_feat_for_m122")
    sgf = _load(EXP / "struct_guard" / "features.py", "vdse_m119_feat_for_m122")
    new = _load(HERE / "run.py", "vdse_m122_run_feat").NEW
    out = {}
    for k, v in sorted(new.items()):
        out[k] = amf.amount_features(amf.coarse(k, v))
        out[k]["mux_share"] = sgf.features(k, list(v))["mux_share"]
        print(k, out[k], flush=True)
    (HERE / "features.json").write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
