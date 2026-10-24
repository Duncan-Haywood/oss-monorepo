"""Sweep hidden width x weight bits x inputs: check the RTL against the integer reference, then synthesise to SKY130 HD.
Needs the liberty file: sh ../accel-pdkprice/fetch_pdk.sh pdk (from research/accel-ttfit)."""
import json, os, sys
from concurrent.futures import ProcessPoolExecutor
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_ttfit import rtl

LIB = os.path.join(HERE, "..", "pdk")
GRID = [(IN, H, wb) for IN in (70, 120) for H in (8, 16, 32, 64) for wb in (2, 3, 4, 8)]


def point(g):
    IN, H, wb = g
    m = rtl.random_model(IN, H, wb, seed=IN * 1000 + H * 10 + wb)
    xq = np.random.default_rng(7).integers(-128, 128, (4, IN))
    cls, t = rtl.simulate(m, xq)
    ref, _ = rtl.reference(m, xq)
    s = rtl.synth(IN, H, wb, LIB)
    return dict(inputs=IN, hidden=H, wbits=wb, cycles=rtl.cycles(IN, H), rtl_exact=bool((cls == ref).all() and len(cls) == 4
                and all(b - a == rtl.cycles(IN, H) for a, b in zip(t, t[1:]))),
                cells=s["cells"], flops=s["flops"], area_um2=round(s["area_um2"], 1))


if __name__ == "__main__":
    with ProcessPoolExecutor(4) as ex:
        rows = list(ex.map(point, GRID))
    tool = {"yosys": os.popen("yosys -V").read().strip(), "iverilog": os.popen("iverilog -V 2>&1 | head -1").read().strip()}
    json.dump(dict(versions=tool, rows=rows), open(os.path.join(HERE, "results.json"), "w"), indent=1)
    with open(os.path.join(HERE, "results.txt"), "w") as f:
        f.write(f"{tool['yosys']}; {tool['iverilog']}\n")
        f.write("  in  H wb | cycles exact cells flops area_um2\n")
        for r in rows:
            f.write(f"{r['inputs']:4d} {r['hidden']:3d} {r['wbits']:2d} | {r['cycles']:6d} {r['rtl_exact']!s:5} {r['cells']:5d} {r['flops']:4d} {r['area_um2']:9.1f}\n")
    print(open(os.path.join(HERE, "results.txt")).read())
