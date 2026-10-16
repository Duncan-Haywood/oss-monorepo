"""Place accel-fetchprice's breakevens against SKY130 liberty energies. Needs pdk/ (sh fetch_pdk.sh pdk). Writes results.json, results.txt."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(ROOT, "src"))
from accel_pdkprice import pdk

P = os.path.join(ROOT, "pdk", "orfs", "flow", "platforms")
if not os.path.isdir(P):
    sys.exit("run: sh fetch_pdk.sh pdk")
hd = open(os.path.join(P, "sky130hd", "lib", "sky130_fd_sc_hd__tt_025C_1v80.lib")).read()
assert pdk.units_ok(hd)
fl = pdk.flop_clock_energy(hd)
PERIOD_NS = 10.0  # assumed 100 MHz, only used for the leakage term
fl["leak_pj_per_cycle_10ns"] = pdk.leakage_pj_per_cycle(fl["leak_nw"], PERIOD_NS)
e_flop = fl["total_pj"] + fl["leak_pj_per_cycle_10ns"]

macros = []
for name, width in (("sky130_sram_1rw1r_44x64_8", 44), ("sky130_sram_1rw1r_80x64_8", 80),
                    ("sky130_sram_1rw1r_64x256_8", 64), ("sky130_sram_1rw1r_128x256_8", 128)):
    t = open(os.path.join(P, "sky130ram", name, name + "_TT_1p8V_25C.lib")).read()
    assert pdk.units_ok(t)
    a = pdk.sram_access_energy(t)
    assert len(a["rise_pj"]) == 1 and a["rise_pj"] == a["fall_pj"], (name, a)
    macros.append(dict(macro=name, width=width, access_pj=a["rise_pj"][0]))

rows = json.load(open(os.path.join(ROOT, "data", "fetchprice_results.json")))
out, res = [], []
w = out.append
w("SKY130 liberty energies against accel-fetchprice breakevens (library values, not measurements).")
w(f"idle flop, one cycle: clock-pin internal {fl['internal_pj']*1000:.1f} fJ (table range {fl['internal_lo_pj']*1000:.1f}-{fl['internal_hi_pj']*1000:.1f}) + "
  f"pin C*V^2 {fl['pin_switch_pj']*1000:.2f} fJ + leakage {fl['leak_pj_per_cycle_10ns']*1000:.4f} fJ at an assumed 10 ns = e_flop {e_flop*1000:.1f} fJ")
for m in macros:
    w(f"{m['macro']}: {m['width']}-bit word, clk0 {m['access_pj']:.2f} pJ per access (rise = fall value in the file)")
w("")
w("Register-file WS beats OS iff e_weight > e_flop / (e_flop*/e_w). Minimum e_weight for that, pJ per 4-bit weight fetch:")
w(f"{'shape':9} {'B':>2} {'min e_weight pJ':>16}")
for r in rows:
    if r["e_flop_star_over_e_w"] is None:
        continue
    r["min_e_weight_pj"] = e_flop / r["e_flop_star_over_e_w"]
    w(f"{r['shape']:9} {r['B']:>2} {r['min_e_weight_pj']:>16.2f}")
w("")
w("Verdicts per macro; 'unpacked' = one 4-bit weight per access, 'packed' = width/4 weights share an access. Cells: reg-file WS / psum-in-SRAM WS (the winner).")
w(f"{'shape':9} {'B':>2} " + " ".join(f"{m['width']}b-{k:8}" for m in macros for k in ("unpacked", "packed")))
for r in rows:
    if r["e_flop_star_over_e_w"] is None:
        continue
    cells = []
    for m in macros:
        for packed in (False, True):
            ew = pdk.e_weight_pj(m["access_pj"], m["width"], packed)
            vf = pdk.verdict_flop(r["e_flop_star_over_e_w"], e_flop, ew)
            vp = pdk.verdict_psum(r["r_psum_star"], m["access_pj"], ew)
            cells.append(f"{vf}/{vp}")
            res.append(dict(shape=r["shape"], B=r["B"], macro=m["macro"], packed=packed, e_weight_pj=ew,
                            flop_ws_wins=vf == "WS", psum_ws_wins=vp == "WS"))
    w(f"{r['shape']:9} {r['B']:>2} " + " ".join(f"{c:>{len(str(m['width']))+10}}" for c, m in zip(cells, [m for m in macros for _ in (0, 1)])))
json.dump(dict(flop=fl, e_flop_pj=e_flop, macros=macros, breakeven=[r for r in rows if r["e_flop_star_over_e_w"] is not None], verdicts=res),
          open(os.path.join(HERE, "results.json"), "w"), indent=1)
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
