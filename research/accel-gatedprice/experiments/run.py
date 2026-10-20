"""Clock-gated register-file WS against SKY130 energies; flop and ICG energies in SKY130 and GF180. Needs ../accel-pdkprice/pdk
(sh ../accel-pdkprice/fetch_pdk.sh ../accel-pdkprice/pdk, then `git -C pdk/orfs sparse-checkout add flow/platforms/gf180`) -- or run
fetch_pdk.sh here. Writes results.json and results.txt."""
import gzip, json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(ROOT, "src"))
from accel_gatedprice import lib

P = None
for cand in (os.path.join(ROOT, "pdk"), os.path.join(ROOT, "..", "accel-pdkprice", "pdk")):
    if os.path.isdir(os.path.join(cand, "orfs", "flow", "platforms", "gf180")):
        P = os.path.join(cand, "orfs", "flow", "platforms")
if P is None:
    sys.exit("run: sh fetch_pdk.sh pdk   (in this directory)")
PERIOD_NS = 10.0
sky = open(os.path.join(P, "sky130hd", "lib", "sky130_fd_sc_hd__tt_025C_1v80.lib")).read()
assert lib.units_ok(sky)
leak_pj = lambda nw: nw * PERIOD_NS * 1e-6

cells = []  # (label, flop dict, icg dict)
def add(label, text, pre, ff, icgs, vdd, when=None):
    assert lib.units_ok(text), label
    f = lib.clock_pin_energy(text, pre + ff, "CLK", vdd=vdd)
    for ig in icgs:
        g = lib.clock_pin_energy(text, pre + ig, "CLK", when=when, vdd=vdd)
        cells.append(dict(label=label, flop=f, icg=g, icg_cell=ig))
add("SKY130 HD 1.8 V", sky, "sky130_fd_sc_hd__", "dfxtp_1", ["dlclkp_1", "dlclkp_2", "dlclkp_4"], 1.8)
for tr in ("7t", "9t"):
    for v, vd in (("3v30", 3.3), ("5v00", 5.0)):
        t = gzip.open(os.path.join(P, "gf180", "lib", f"gf180mcu_fd_sc_mcu{tr}5v0__tt_025C_{v}.lib.gz"), "rt").read()
        add(f"GF180MCU {tr} {vd:g} V", t, f"gf180mcu_fd_sc_mcu{tr}5v0__", "dffq_1", ["icgtp_1"], vd, when=["!E&!TE"])

out = []
w = out.append
w("Idle clock energy per cycle (library values, not measurements): internal-power tables + C_pin*VDD^2. pJ.")
w(f"{'node':20} {'ICG cell':10} {'flop':>8} {'ICG':>8} {'ICG/flop':>9}")
for c in cells:
    c["icg_over_flop"] = c["icg"]["total_pj"] / c["flop"]["total_pj"]
    w(f"{c['label']:20} {c['icg_cell']:10} {c['flop']['total_pj']:8.4f} {c['icg']['total_pj']:8.4f} {c['icg_over_flop']:9.3f}")
w("")

# SKY130: gated register-file WS against the accel-pdkprice macros
sk_f = [c for c in cells if c["label"].startswith("SKY130") and c["icg_cell"] == "dlclkp_1"][0]
import re
def leak_nw(cell):
    return float(re.search(r"cell_leakage_power\s*:\s*([\d.eE+-]+)\s*;", lib.cell_block(sky, "sky130_fd_sc_hd__" + cell)).group(1))
e_flop = sk_f["flop"]["total_pj"] + leak_pj(leak_nw("dfxtp_1"))
e_icg = sk_f["icg"]["total_pj"] + leak_pj(leak_nw("dlclkp_1"))
rows = [r for r in json.load(open(os.path.join(ROOT, "data", "fetchprice_results.json"))) if r["e_flop_star_over_e_w"] is not None]
macros = json.load(open(os.path.join(ROOT, "data", "sky130_sram.json")))["macros"]
GS = (1, 24, 48, 192, 576)
w("SKY130: minimum energy per 4-bit weight fetch (pJ) for register-file WS to beat OS, ungated and with one dlclkp_1 per G flops.")
w(f"e_flop {e_flop*1000:.1f} fJ, e_icg (dlclkp_1, idle) {e_icg*1000:.1f} fJ, leakage at {PERIOD_NS:g} ns included.")
w(f"{'shape':9} {'B':>2} {'ungated':>8} " + " ".join(f"{'G='+str(g):>8}" for g in GS))
mins = []
for r in rows:
    ratio = r["e_flop_star_over_e_w"]
    m = dict(shape=r["shape"], B=r["B"], ratio=ratio, ungated_pj=lib.min_e_weight_pj(e_flop, ratio))
    for g in GS:
        m[f"G{g}_pj"] = lib.min_e_weight_pj(lib.gated_cost_per_flop_cycle(e_icg, g), ratio)
    mins.append(m)
    w(f"{r['shape']:9} {r['B']:>2} {m['ungated_pj']:8.3f} " + " ".join(f"{m[f'G{g}_pj']:8.3f}" for g in GS))
w("")
w("Smallest group size G (flops per clock gate) at which gated WS beats OS, for each SKY130 macro. 1 = a gate per flop already wins; '-' = no G wins.")
w("'u' = one weight per access, 'p' = weights packed in the word.")
hdr = f"{'shape':9} {'B':>2} " + " ".join(f"{m['width']}b-{k}" .rjust(8) for m in macros for k in "up")
w(hdr)
gstar, flips = [], 0
for r, mm in zip(rows, mins):
    cells_ = []
    for m in macros:
        for packed in (False, True):
            ew = m["access_pj"] / (m["width"] // 4) if packed else m["access_pj"]
            # WS wins iff e_icg/G + leak_flop < ew * ratio  (G=inf: flop leakage only)
            floor = leak_pj(leak_nw("dfxtp_1"))
            head = ew * r["e_flop_star_over_e_w"] - floor
            g = None if head <= 0 else max(1, math.ceil(e_icg / head))
            ungated = e_flop < ew * r["e_flop_star_over_e_w"]
            gstar.append(dict(shape=r["shape"], B=r["B"], macro=m["macro"], packed=packed, e_weight_pj=ew,
                              g_star=g, ungated_ws_wins=ungated))
            flips += (not ungated) and g is not None
            cells_.append(("-" if g is None else str(g)) + ("*" if ungated else ""))
    w(f"{r['shape']:9} {r['B']:>2} " + " ".join(c.rjust(8) for c in cells_))
w("(* = ungated WS already wins there.)")
w(f"cells where ungated WS loses but some gated size wins: {flips} of {len(gstar)}; "
  f"cells with no winning size: {sum(g['g_star'] is None for g in gstar)}")
w("")
w("Node-free form: ungated WS needs the weight fetch to cost more than 1/ratio flop-cycles; a gate shared by G flops cuts that by G/(ICG/flop).")
w(f"{'shape':9} {'B':>2} {'ungated, in e_flop':>19} {'G=24, in e_flop':>16} {'G=192, in e_flop':>17}")
for m in mins:
    w(f"{m['shape']:9} {m['B']:>2} {1/m['ratio']:19.1f} {(e_icg/e_flop)/24/m['ratio']:16.2f} {(e_icg/e_flop)/192/m['ratio']:17.2f}")
w(f"SKY130 SRAM macros in e_flop units: unpacked {min(x['access_pj'] for x in macros)/e_flop:.0f} to {max(x['access_pj'] for x in macros)/e_flop:.0f}; "
  f"packed {min(x['access_pj']/(x['width']//4) for x in macros)/e_flop:.0f} to {max(x['access_pj']/(x['width']//4) for x in macros)/e_flop:.0f}")
json.dump(dict(cells=cells, e_flop_pj=e_flop, e_icg_pj=e_icg, period_ns=PERIOD_NS, min_e_weight=mins, g_star=gstar),
          open(os.path.join(HERE, "results.json"), "w"), indent=1)
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
