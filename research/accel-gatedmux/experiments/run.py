"""Re-run accel-gatedlanes' sweep (64x70 layer, B = 4 and 8, four modes) on the rewritten read mux, now out to P = 64, and
compare area with accel-gatedlanes' results (original RTL, same flow). RTL simulation is bit-exact against NumPy; Yosys to SKY130 HD.
Needs the liberty file (sh ../accel-pdkprice/fetch_pdk.sh ../accel-pdkprice/pdk). Writes results.json and results.txt."""
import json, os, resource, sys, time
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "accel-gatedprice", "src"))
import numpy as np
from accel_gatedmux import new, rtl_base
from accel_gatedprice import lib

PDK = next((p for p in (os.path.join(HERE, "..", "..", "accel-pdkprice", "pdk"), "/tmp/pdk")
            if os.path.exists(os.path.join(p, rtl_base.LIB_REL))), None)
if PDK is None:
    sys.exit("run: sh ../accel-pdkprice/fetch_pdk.sh ../accel-pdkprice/pdk")
LIBTXT = open(os.path.join(PDK, rtl_base.LIB_REL)).read()
assert lib.units_ok(LIBTXT)
resource.setrlimit(resource.RLIMIT_AS, (7 << 30, 7 << 30))   # same 7 GB cap as accel-gatedlanes, inherited by each Yosys
O, I, N, VDD = 64, 70, 2, 1.8
BATCHES, LANES = (4, 8), (2, 4, 8, 16, 32, 64)
PRE = "sky130_fd_sc_hd__"
E_FLOP = lib.clock_pin_energy(LIBTXT, PRE + "dfxtp_1", "CLK", vdd=VDD)["total_pj"] * 1000
E_ICG = lib.clock_pin_energy(LIBTXT, PRE + "dlclkp_1", "CLK", vdd=VDD)["total_pj"] * 1000
OLD = {(r["P"], r["B"], r["mode"]): r for r in json.load(open(os.path.join(HERE, "..", "..", "accel-gatedlanes", "experiments", "results.json")))["rows"]}


def point(args):
    P, B, mode = args
    W, X = rtl_base.random_problem(O, I, B, N, seed=O * 1000 + I + B)
    ref = np.einsum("nbi,oi->nbo", X, W)
    m, y = new.simulate(mode, O, I, B, P, W, X)
    t0 = time.time()
    try:
        s = new.synth(mode, O, I, B, P, PDK)
    except Exception as e:   # memory limit or Yosys error: record, do not hide
        return dict(P=P, B=B, mode=mode, design=rtl_base.MODES[mode], failed=str(e)[-200:])
    n_acc = (1 if mode == 0 else B) * P * rtl_base.ACCW
    written, cycles = int(m[0, 3]), int(m[0, 0])
    e_clk = (n_acc * E_FLOP) if mode < 2 else (s["icgs"] * E_ICG + written / cycles * E_FLOP)
    o = OLD.get((P, B, mode))
    return dict(P=P, B=B, mode=mode, design=rtl_base.MODES[mode], cycles=cycles, w_rd=int(m[0, 1]), x_rd=int(m[0, 2]),
                written_bits=written, const=bool((m == m[0]).all()), bit_exact=bool((y == ref).all()), acc_flops=n_acc,
                cells=s["cells"], flops=s["flops"], icgs=s["icgs"], area_um2=s["area_um2"], clk_fj_per_cycle=e_clk,
                synth_s=round(time.time() - t0, 1), old_cells=o and o["cells"], old_area_um2=o and o["area_um2"],
                old_flops=o and o["flops"])


if __name__ == "__main__":
    jobs = [(P, B, mode) for P in LANES for B in BATCHES for mode in range(4)]
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as ex:
        rows = list(ex.map(point, jobs))
    failed = [r for r in rows if "failed" in r]
    rows = [r for r in rows if "failed" not in r]
    json.dump(dict(e_flop_fj=E_FLOP, e_icg_fj=E_ICG, failed=[(r["P"], r["B"], r["design"]) for r in failed], rows=rows),
              open(os.path.join(HERE, "results.json"), "w"), indent=1)
    by = {(r["P"], r["B"], r["mode"]): r for r in rows}
    out, w = [], None
    w = out.append
    w(f"{len(rows)} points: layer {O}x{I}, {N} random problems each, int4 weights, int8 inputs, 24-bit accumulators; Yosys to SKY130 HD tt_025C_1v80, rewritten read mux.")
    w(f"synthesis failures (7 GB limit): {[(r['P'], r['B'], r['design']) for r in failed] or 'none'}")
    w(f"bit-exact against NumPy in all runs: {all(r['bit_exact'] for r in rows)}; counts identical across problems: {all(r['const'] for r in rows)}")
    w(f"accumulator bits written identical across the four modes at each (P, B): "
      f"{all(len({by[(P, B, m)]['written_bits'] for m in range(4) if (P, B, m) in by}) == 1 for P in LANES for B in BATCHES)}")
    w("\n  P  B design         cycles  flops  gates   cells  area_um2  old_area  new/old  area/OS  area/ungated  clk/OS  synth_s")
    for B in BATCHES:
        for P in LANES:
            if (P, B, 0) not in by or (P, B, 1) not in by:
                continue
            os_, un = by[(P, B, 0)], by[(P, B, 1)]
            for m in range(4):
                if (P, B, m) not in by:
                    continue
                r = by[(P, B, m)]
                oa = r["old_area_um2"]
                w(f"{P:3d} {B:2d} {r['design']:12s} {r['cycles']:7d} {r['flops']:6d} {r['icgs']:5d} {r['cells']:7d} {r['area_um2']:9.0f} "
                  f"{(f'{oa:9.0f}' if oa else '        -')} {(f'{r['area_um2'] / oa:8.2f}' if oa else '       -')} "
                  f"{r['area_um2'] / os_['area_um2']:8.2f} {r['area_um2'] / un['area_um2']:12.2f} "
                  f"{r['clk_fj_per_cycle'] / os_['clk_fj_per_cycle']:7.2f} {r['synth_s']:7.1f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))
