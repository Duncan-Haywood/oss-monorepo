"""Milestone 137 (milestone 133's probe, unchanged apart from names and paths): the parameter probe, run before the blind set is fixed. For each candidate in run.py's CAND it computes the
amount features (word depth, gate depth, mux_share; the same code as experiments/blind_probe/features.py) and runs ONE flow point,
the default script (empty ABC sequence) at a 10 ns period, to estimate the cost ratio routed/r2 = (r2 + r3 + r4) / r2 from its
stage times. No ABC sequence of the 120 is run and no routed score is looked at, so the probe sees cost, not rank.

Selection rule (written here before probe.txt existed): keep every candidate whose probe ratio is above 3.3 (theta = 3 plus a
0.3 margin, since a table's mean ratio differs from one point's) and that passes check_designs.py. Milestone 132's lesson is that
a design under theta says nothing about any rule.

Writes probe.json and probe.txt. Usage: python3 probe.py --openroad <bin> [--pdk <dir>] [--jobs 4]   (Yosys 0.70 on PATH)
"""
import argparse
import importlib.util
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import flow  # noqa: E402

CUT = 3.3


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


CAND = _load(HERE / "run.py", "vdse_m137_run_probe").CAND


def ratio(r):
    s = r["t_pnr_to_synth_netlist"]
    r2 = r["t2_yosys"] + s
    return (r2 + (r["t_pnr_to_detail_place"] - s) + (r["t_pnr_total"] - r["t_pnr_to_detail_place"])) / r2


def point(a):
    d, wd, lib, pdk, orb = a
    flow.DESIGNS.clear()
    flow.DESIGNS.update(CAND)
    r = flow.run_point(d, (), 10.0, wd, lib, pdk, orb)
    return d, {"ratio": ratio(r), "t2_yosys": r["t2_yosys"], "t_pnr_total": r["t_pnr_total"],
               "synth_netlist_period_ns": r["synth_netlist_period_ns"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", required=True)
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/verified-dse-confirm-probe")
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    gd = _load(EXP / "amount_cut" / "gate_depth.py", "vdse_m123_gate_depth_for_m137")
    sgf = _load(EXP / "struct_guard" / "features.py", "vdse_m119_feat_for_m137")
    flow.DESIGNS.update(CAND)
    feat = {k: {**gd.amf.amount_features(gd.amf.coarse(k, v)), **gd.gate_depth(k, v), "mux_share": sgf.features(k, list(v))["mux_share"]}
            for k, v in CAND.items()}
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(pdk / "lib/sky130_fd_sc_hd__tt_025C_1v80.lib", lib)
    with Pool(a.jobs) as pool:
        pts = dict(pool.map(point, [(d, out / d, lib, pdk, a.openroad) for d in CAND]))
    res = {d: {**feat[d], **pts[d], "keep": pts[d]["ratio"] > CUT} for d in CAND}
    (HERE / "probe.json").write_text(json.dumps(res, indent=1, sort_keys=True) + "\n")
    lines = [f"# Milestone 137 parameter probe (one default-script point per candidate; keep if routed/r2 > {CUT})", "",
             "design | amount_depth | amount_gate_depth | amount_gates | mux_share | probe routed/r2 | base period ns | keep"]
    for d in sorted(res, key=lambda d: (res[d]["amount_gate_depth"], d)):
        f = res[d]
        lines.append(f"{d} | {f['amount_depth']} | {f['amount_gate_depth']} | {f['amount_gates']} | {f['mux_share']:.3f} | "
                     f"{f['ratio']:.2f} | {f['synth_netlist_period_ns']:.2f} | {f['keep']}")
    (HERE / "probe.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
