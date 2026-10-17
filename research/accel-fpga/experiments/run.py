"""Sweep kws_engine geometry through Yosys + nextpnr-ice40 on two devices. Writes results.json/results.txt."""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_fpga import flow  # noqa: E402

IN, HS, WBS, SEEDS = 70, (8, 16, 32, 64, 128), (2, 4, 8), (1, 2, 3)
kws = json.load(open(os.path.join(HERE, "..", "..", "accel-kws", "experiments", "results.json")))
acc = {(r["segments"], r["hidden"], r["wbits"]): (r["test_mean"], r["cycles"][0]) for r in kws["rows"]}


def tool_version(name):
    r = subprocess.run(flow.tool(name) + ["-V" if name == "yosys" else "--version"],
                          capture_output=True, text=True)
    return (r.stdout + r.stderr).strip().splitlines()[0]


rows = []
for H in HS:
    for wb in WBS:
        m = flow.random_model(IN, H, wb, seed=H * 10 + wb)
        rng = np.random.default_rng(H + wb)
        ok = 0
        for t in range(3):                      # RTL top vs integer reference on 3 random inputs
            x = rng.integers(-128, 128, IN)
            with tempfile.TemporaryDirectory() as d:
                flow.write_hex(m, x, d)
                ok += flow.sim_class(m, x, d) == flow.reference_class(m, x)
        x = rng.integers(-128, 128, IN)
        row = {"H": H, "wbits": wb, "rtl_match": f"{ok}/3", "rom_kbit": round((IN * H + H * 11) * wb / 1000, 1)}
        row["test_acc_trained"], row["cycles"] = acc[(7, H, wb)]
        for dev in flow.DEVICES:
            row[dev] = flow.synth_nextpnr(m, x, dev, seeds=SEEDS)
            print(H, wb, dev, row[dev], flush=True)
        rows.append(row)

out = {"versions": {"yosys": tool_version("yosys"), "nextpnr": tool_version("nextpnr-ice40")},
       "seeds": list(SEEDS), "freq_target_mhz": 60, "rows": rows}
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
with open(os.path.join(HERE, "results.txt"), "w") as f:
    f.write(json.dumps(out["versions"]) + "\n")
    f.write("H wb rtl  ROMkb | acc(trained, accel-kws) cycles | up5k: LC EBR Fmax | hx8k: LC EBR Fmax | lat_up5k_ms\n")
    for r in rows:
        u, h = r["up5k"], r["hx8k"]
        fm = lambda d: f"{d['fmax']:.1f}" if d.get("fmax") else "-"
        lc = lambda d: str(d.get("pnr_lc", "-")) if d.get("fits") else "NOFIT"
        lat = r["cycles"] / u["fmax"] / 1000 if u.get("fmax") else float("nan")
        f.write(f"{r['H']:3d} {r['wbits']} {r['rtl_match']} {r['rom_kbit']:6.1f} | {r['test_acc_trained']:.3f} {r['cycles']:6d} | "
                f"{lc(u):>5} {u.get('pnr_ebr','-'):>2} {fm(u):>5} | {lc(h):>5} {h.get('pnr_ebr','-'):>2} {fm(h):>5} | {lat:.2f}\n")
print(open(os.path.join(HERE, "results.txt")).read())
