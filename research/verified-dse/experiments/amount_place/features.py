"""Milestone 124: the amount's word-level depth (experiments/amount_depth/features.py), its gate-level depth
(experiments/amount_cut/gate_depth.py) and rung 1's mux_share (experiments/struct_guard/features.py), all unchanged, for this
milestone's seven blind designs. Seconds per design; no flow run. Computed before any flow run of this milestone.

Writes features.json. Usage: python3 features.py   (Yosys 0.70 on PATH)
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
    gd = _load(EXP / "amount_cut" / "gate_depth.py", "vdse_m123_gate_depth_for_m124")
    sgf = _load(EXP / "struct_guard" / "features.py", "vdse_m119_feat_for_m124")
    new = _load(HERE / "run.py", "vdse_m124_run_feat").NEW
    out = {}
    for k, v in sorted(new.items()):
        out[k] = {**gd.amf.amount_features(gd.amf.coarse(k, v)), **gd.gate_depth(k, v), "mux_share": sgf.features(k, list(v))["mux_share"]}
        print(k, out[k], flush=True)
    (HERE / "features.json").write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
