"""Synthesise accel-ttfit's streaming KWS engine at hidden widths above 64 (H = 96, 128, 192, 256), check the RTL
against the integer reference at each, and write synth.json. Needs yosys, iverilog, numpy and the liberty file
(sh ../accel-pdkprice/fetch_pdk.sh ../accel-ttfit/pdk, from this directory)."""
import json, os, sys
from concurrent.futures import ProcessPoolExecutor
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "accel-ttfit", "src"))
from accel_ttfit import rtl

LIB = os.path.join(HERE, "..", "..", "accel-ttfit", "pdk")
GRID = [(IN, H, wb, acc) for IN in (70, 120) for H in (96, 128, 192, 256) for wb in (2, 3, 4, 8) for acc in (20, 24)]


def point(g):
    IN, H, wb, accw = g
    rtl.ACCW = accw   # module global read by simulate, reference and synth
    m = rtl.random_model(IN, H, wb, seed=IN * 1000 + H * 10 + wb)
    xq = np.random.default_rng(7).integers(-128, 128, (3, IN))
    try:
        ref, _ = rtl.reference(m, xq)
    except AssertionError:   # this random model overflows the accumulator: the RTL would wrap, the contract says it must not
        ok = None
    else:
        cls, t = rtl.simulate(m, xq)
        ok = bool((cls == ref).all() and all(b - a == rtl.cycles(IN, H) for a, b in zip(t, t[1:])))
    s = rtl.synth(IN, H, wb, LIB)
    return dict(inputs=IN, hidden=H, wbits=wb, accw=accw, cycles=rtl.cycles(IN, H), rtl_exact=ok,
                cells=s["cells"], flops=s["flops"], area_um2=round(s["area_um2"], 1))


if __name__ == "__main__":
    with ProcessPoolExecutor(4) as ex:
        rows = list(ex.map(point, GRID))
    json.dump(dict(yosys=os.popen("yosys -V").read().strip(), rows=rows), open(os.path.join(HERE, "synth.json"), "w"), indent=1)
    for r in rows:
        print(r)
