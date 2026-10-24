"""Second-node verdict: IHP SG13G2 flop, clock gate and SRAM macros against accel-fetchprice's breakevens.
Needs pdk/ (sh fetch_pdk.sh pdk). Writes results.json and results.txt."""
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(ROOT, "src"))
from accel_ihpprice import lib

P = os.path.join(ROOT, "pdk", "orfs", "flow", "platforms")
if not os.path.isdir(P):
    sys.exit("run: sh fetch_pdk.sh pdk")
PERIOD_NS = 10.0
rd = lambda *a: open(os.path.join(P, *a)).read()

# (label, file text, vdd, flop cell, flop pin, gate cell, gate pin, when for the idle gate)
POINTS = [
    ("SKY130 HD 1.8 V", rd("sky130hd", "lib", "sky130_fd_sc_hd__tt_025C_1v80.lib"), 1.8,
     "sky130_fd_sc_hd__dfxtp_1", "CLK", "sky130_fd_sc_hd__dlclkp_1", "CLK", None),
    ("IHP SG13G2 1.2 V", rd("ihp-sg13g2", "lib", "sg13g2_stdcell_typ_1p20V_25C.lib"), 1.2,
     "sg13g2_dfrbp_1", "CLK", "sg13g2_slgcp_1", "CLK", None),
    ("IHP SG13G2 1.5 V", rd("ihp-sg13g2", "lib", "sg13g2_stdcell_typ_1p50V_25C.lib"), 1.5,
     "sg13g2_dfrbp_1", "CLK", "sg13g2_slgcp_1", "CLK", None),
    ("NanGate45 1.1 V", rd("nangate45", "lib", "NangateOpenCellLibrary_typical.lib"), 1.1,
     "DFF_X1", "CK", "CLKGATE_X1", "CK", None),
]
pts = []
for label, t, vdd, fc, fp, gc, gp, wh in POINTS:
    f = lib.clock_pin_energy(t, fc, fp, vdd)
    g = lib.clock_pin_energy(t, gc, gp, vdd, when=wh)
    pts.append(dict(label=label, vdd=vdd, flop=f, icg=g, icg_over_flop=g["total_pj"] / f["total_pj"],
                    unit_pj=lib.energy_unit_pj(t), unit_vima_pj=lib.vima_unit_pj(t),
                    flop_ratio=lib.unit_ratio(f), icg_ratio=lib.unit_ratio(g),
                    flop_leak_pj=lib.leakage_pj_per_cycle(t, f["cell_leakage"], PERIOD_NS) if f["cell_leakage"] else 0.0,
                    icg_leak_pj=lib.leakage_pj_per_cycle(t, g["cell_leakage"], PERIOD_NS) if g["cell_leakage"] else 0.0))

out = []
w = out.append
w("A. Idle clock energy per cycle of a flop and of a clock gate (library values, not measurements). fJ.")
w(f"{'node':18} {'flop cell':16} {'flop':>8} {'gate cell':16} {'gate':>8} {'gate/flop':>9}  internal/(C*V^2): flop gate")
for p in pts:
    w(f"{p['label']:18} {p['flop']['cell'][-14:]:16} {p['flop']['total_pj']*1000:8.2f} {p['icg']['cell'][-14:]:16} "
      f"{p['icg']['total_pj']*1000:8.2f} {p['icg_over_flop']:9.3f}  {p['flop_ratio']:20.2f} {p['icg_ratio']:5.2f}")
w("")
w("B. Which unit reading is physical? Energy of one clock-pin cycle divided by C_pin x VDD^2, read two ways (a value near 1 to 20 is plausible).")
w(f"{'node':18} {'pJ per unit, C*V^2':>20} {'pJ per unit, V*I*t':>20} {'flop ratio, C*V^2':>18} {'flop ratio, V*I*t':>18}")
for p in pts:
    k = p["unit_vima_pj"] / p["unit_pj"]
    w(f"{p['label']:18} {p['unit_pj']:20.4g} {p['unit_vima_pj']:20.4g} {p['flop_ratio']:18.2f} {p['flop_ratio']*k:18.4g}")
w("")

ihp = [p for p in pts if p["label"] == "IHP SG13G2 1.2 V"][0]
sky = pts[0]
e_flop = ihp["flop"]["total_pj"] + ihp["flop_leak_pj"]
e_icg = ihp["icg"]["total_pj"] + ihp["icg_leak_pj"]

macros = []
for f in sorted(glob.glob(os.path.join(P, "ihp-sg13g2", "lib", "RM_IHPSG13_1P_*_typ_1p20V_25C.lib"))):
    t = open(f).read()
    words, bits = lib.macro_dims(os.path.basename(f))
    e = lib.macro_access_energy(t)
    assert e["idle"] == 0.0
    macros.append(dict(macro=os.path.basename(f).split("_bm_")[0].replace("RM_IHPSG13_1P_", ""), words=words, bits=bits,
                       capacity_bits=words * bits, read_pj=e["read"], write_pj=e["write"]))
macros.sort(key=lambda m: (m["bits"], m["words"]))
w("C. IHP SG13G2 SRAM macros (typ 1.2 V 25 C): energy per access from the A_CLK pin, read and write listed separately in the file. pJ.")
w(f"{'macro':14} {'capacity':>9} {'read':>8} {'write':>8} {'read/bit':>9} {'packed read/weight':>19} {'in flop-cycles':>15}")
for m in macros:
    m["packed_pj"] = lib.e_weight_pj(m["read_pj"], m["bits"], True)
    m["packed_flop_cycles"] = m["packed_pj"] / e_flop
    m["unpacked_flop_cycles"] = m["read_pj"] / e_flop
    w(f"{m['macro']:14} {m['capacity_bits']:9d} {m['read_pj']:8.2f} {m['write_pj']:8.2f} {m['read_pj']/m['bits']:9.3f} "
      f"{m['packed_pj']:19.3f} {m['packed_flop_cycles']:15.0f}")
w("")

rows = [r for r in json.load(open(os.path.join(ROOT, "data", "fetchprice_results.json"))) if r["e_flop_star_over_e_w"] is not None]
LAYER_BITS = {"L1 64x70": 64 * 70 * 4, "L2 11x64": 11 * 64 * 4}
GS = (1, 24, 192)
w(f"D. IHP 1.2 V: minimum weight-fetch energy (pJ per 4-bit weight) for register-file WS to beat OS. e_flop {e_flop*1000:.2f} fJ, e_icg {e_icg*1000:.2f} fJ.")
w(f"{'shape':9} {'B':>2} {'ungated':>8} " + " ".join(f"{'G='+str(g):>8}" for g in GS) + f" {'ungated, in flop-cycles':>24}")
mins = []
for r in rows:
    ratio = r["e_flop_star_over_e_w"]
    m = dict(shape=r["shape"], B=r["B"], ratio=ratio, ungated_pj=lib.min_e_weight_pj(e_flop, ratio),
             ungated_flop_cycles=1 / ratio)
    for g in GS:
        m[f"G{g}_pj"] = lib.min_e_weight_pj(lib.gated_cost_per_flop_cycle(e_icg, g, ihp["flop_leak_pj"]), ratio)
    mins.append(m)
    w(f"{r['shape']:9} {r['B']:>2} {m['ungated_pj']:8.3f} " + " ".join(f"{m[f'G{g}_pj']:8.3f}" for g in GS) + f" {m['ungated_flop_cycles']:24.0f}")
w("")

w("E. Verdicts, WS or OS, against each IHP macro that can hold the layer (capacity >= layer bits). Cells: ungated / gated with G=24 (one 24-bit accumulator per gate).")
w("'u' = one weight per access, 'p' = weights packed in the word; reads only (inference).")
verd = []
for shape in LAYER_BITS:
    ms = [m for m in macros if m["capacity_bits"] >= LAYER_BITS[shape]]
    w(f"{shape} ({LAYER_BITS[shape]} weight bits); cells are ungated/gated, then the smallest G that wins")
    Bs = [r["B"] for r in rows if r["shape"] == shape]
    w(f"{'macro':14} {'':3} " + " ".join(f"B={b:<2}".rjust(15) for b in Bs))
    for m in ms:
        for packed in (False, True):
            cells = []
            for r in [r for r in rows if r["shape"] == shape]:
                ew = lib.e_weight_pj(m["read_pj"], m["bits"], packed)
                ung = e_flop < ew * r["e_flop_star_over_e_w"]
                g24 = lib.gated_cost_per_flop_cycle(e_icg, 24, ihp["flop_leak_pj"]) < ew * r["e_flop_star_over_e_w"]
                gmin = lib.min_group_size(e_icg, ew, r["e_flop_star_over_e_w"], ihp["flop_leak_pj"])
                verd.append(dict(shape=shape, B=r["B"], macro=m["macro"], packed=packed, e_weight_pj=ew,
                                 ungated_ws_wins=ung, g24_ws_wins=g24, g_star=gmin))
                cells.append(f"{'WS' if ung else 'OS'}/{'WS' if g24 else 'OS'} G>={gmin}")
            w(f"{m['macro']:14} {'p' if packed else 'u':3} " + " ".join(c.rjust(15) for c in cells))
fit = [v for v in verd]
w("")
w(f"cells: {len(fit)}; ungated WS wins in {sum(v['ungated_ws_wins'] for v in fit)}; gated (G=24) WS wins in {sum(v['g24_ws_wins'] for v in fit)}; "
  f"packed only: ungated {sum(v['ungated_ws_wins'] for v in fit if v['packed'])} of {sum(1 for v in fit if v['packed'])}, "
  f"gated {sum(v['g24_ws_wins'] for v in fit if v['packed'])}")
w("")

sk = json.load(open(os.path.join(ROOT, "data", "sky130_sram.json")))["macros"]
e_flop_sky = sky["flop"]["total_pj"]
w("F. Node comparison in node-free units: weight-fetch energy in idle-flop-cycles (the thresholds in section D are 1/ratio of these).")
lo_i, hi_i = min(m["packed_flop_cycles"] for m in macros), max(m["packed_flop_cycles"] for m in macros)
w(f"IHP SG13G2 packed macros: {lo_i:.0f} to {hi_i:.0f} flop-cycles per weight; unpacked {min(m['unpacked_flop_cycles'] for m in macros):.0f} to {max(m['unpacked_flop_cycles'] for m in macros):.0f}")
sp = [m["access_pj"] / (m["width"] // 4) / e_flop_sky for m in sk]
su = [m["access_pj"] / e_flop_sky for m in sk]
w(f"SKY130 OpenRAM packed macros: {min(sp):.0f} to {max(sp):.0f} flop-cycles per weight; unpacked {min(su):.0f} to {max(su):.0f}")
w(f"ungated WS needs more than {min(m['ungated_flop_cycles'] for m in mins):.0f} to {max(m['ungated_flop_cycles'] for m in mins):.0f} flop-cycles per weight fetch")
w(f"flop energy: SKY130 {e_flop_sky*1000:.1f} fJ, IHP 1.2 V {e_flop*1000:.1f} fJ, ratio {e_flop_sky/e_flop:.1f}; gate/flop: SKY130 {sky['icg_over_flop']:.2f}, IHP {ihp['icg_over_flop']:.2f}")
json.dump(dict(points=pts, macros=macros, e_flop_pj=e_flop, e_icg_pj=e_icg, period_ns=PERIOD_NS, min_e_weight=mins, verdicts=verd,
               sky130_packed_flop_cycles=sp, sky130_unpacked_flop_cycles=su),
          open(os.path.join(HERE, "results.json"), "w"), indent=1)
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
