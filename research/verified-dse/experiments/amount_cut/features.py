"""Milestone 123: the amount's word-level depth (experiments/amount_depth/features.py, unchanged), its gate-level depth
(gate_depth.py) and rung 1's mux_share (experiments/struct_guard/features.py, unchanged) for this milestone's six blind designs, and
the gate-level depth for every seen design (milestones 119 to 122's blind designs and the 62 seen before them). Seconds per design;
no flow run. Computed before any flow run of this milestone.

Writes features.json (blind designs) and seen_gate_depth.json (seen designs).
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
    gd = _load(HERE / "gate_depth.py", "vdse_m123_gate_depth")
    sgf = _load(EXP / "struct_guard" / "features.py", "vdse_m119_feat_for_m123")
    new = _load(HERE / "run.py", "vdse_m123_run_feat").NEW
    out = {}
    for k, v in sorted(new.items()):
        out[k] = {**gd.amf.amount_features(gd.amf.coarse(k, v)), **gd.gate_depth(k, v), "mux_share": sgf.features(k, list(v))["mux_share"]}
        print(k, out[k], flush=True)
    (HERE / "features.json").write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
    seen = gd.amf.designs()
    seen.update({k: list(v) for k, v in _load(EXP / "amount_threshold" / "run.py", "vdse_m122_run_for_m123").NEW.items()})
    sg = {k: gd.gate_depth(k, v) for k, v in sorted(seen.items())}
    (HERE / "seen_gate_depth.json").write_text(json.dumps(sg, indent=1, sort_keys=True) + "\n")
    print(len(sg), "seen designs")


if __name__ == "__main__":
    main()
