"""Print the tables in the README from results.json (no new numbers are computed elsewhere)."""
import json
import statistics as st
from pathlib import Path

d = json.loads((Path(__file__).parent / "results.json").read_text())
R = d["runs"]
print(d["openroad"], "|", d["yosys"])
print("\nAREA  (um^2; final excludes tap cells)")
print(f"{'design':18}{'generic':>8}{'mapped':>8}{'um2/gate':>9}{'mapped um2':>11}{'final um2':>10}{'final/mapped':>13}{'cells m->f':>12}")
for r in R:
    print(f"{r['name']:18}{r['gen_cells']:8d}{r['synth_cells']:8d}{r['synth_area_um2']/r['gen_cells']:9.2f}"
          f"{r['synth_area_um2']:11.1f}{r['final_area_notap']:10.1f}{r['final_area_notap']/r['synth_area_um2']:13.3f}"
          f"{r['synth_cells']:>6d}->{r['final_cells']:<4d}")
print("\nTIMING  (implied minimum period = target - worst slack, ns; target in column 2)")
print(f"{'design':18}{'target':>7}{'netlist':>9}{'post-place':>11}{'final':>7}{'place/netlist':>14}")
for r in R:
    pp = r["period_ns"] - r["detail_place_wns"]
    print(f"{r['name']:18}{r['period_ns']:7.1f}{r['synth_netlist_period_ns']:9.2f}{pp:11.2f}{r['final_period_ns']:7.2f}{pp/r['synth_netlist_period_ns']:14.3f}")
base = [r for r in R if "_T" not in r["name"]]
ratio = [r["synth_area_um2"] / r["gen_cells"] for r in base]
print(f"\num2 per generic gate over {len(base)} designs: min {min(ratio):.2f}, max {max(ratio):.2f}, "
      f"mean {st.mean(ratio):.2f}, sd {st.stdev(ratio):.2f}")
fr = [r["final_area_notap"] / r["synth_area_um2"] for r in base]
print(f"final/mapped area over the same designs: min {min(fr):.3f}, max {max(fr):.3f}")
