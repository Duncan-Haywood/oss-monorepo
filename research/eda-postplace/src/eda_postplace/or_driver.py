"""Placement and timing repair of one mapped netlist with the OpenROAD Python wheel (`pip install openroad`).

Run with an interpreter that has the wheel: python or_driver.py PLATFORM_DIR LIBERTY NETLIST TOP PERIOD_NS [UTIL_PCT]
Prints `STAGE <name>` blocks of OpenROAD output that `flow.parse_log` reads.

The wheel's Tcl `initialize_floorplan` and `make_tracks` segfault, so the floorplan is made through the Python API
(`makeDieUtilization`, `makeRows`) and the rest through Tcl. Without tracks there is no global routing: parasitics are
estimated from the placement (`estimate_parasitics -placement`), and the clock is ideal (no clock-tree synthesis)."""
import sys

import openroad


def main(plat, lib, netlist, top, period, util="40"):
    tech = openroad.Tech()
    tech.readLef(f"{plat}/lef/sky130_fd_sc_hd.tlef")
    tech.readLef(f"{plat}/lef/sky130_fd_sc_hd_merged.lef")
    tech.readLiberty(lib)
    d = openroad.Design(tech)
    d.readVerilog(netlist)
    d.link(top)
    fp = d.getFloorplan()
    fp.makeDieUtilization(float(util), 1.0, 2, 2, 2, 2)
    fp.makeRows(d.getBlock().getCoreArea(), fp.findSite("unithd"))
    t = d.evalTclString
    t(f"create_clock -name clk -period {period} [get_ports clk]")
    t("set_input_delay 0 -clock clk [lsearch -inline -all -not -exact [all_inputs] [get_ports clk]]")
    t("set_output_delay 0 -clock clk [all_outputs]")
    t(f"source {plat}/setRC.tcl")

    def stage(name):
        t(f'puts "STAGE {name}"; report_design_area; report_worst_slack -max')

    stage("netlist")
    t("global_placement -skip_io -density 0.6")
    t("place_pins -hor_layers met3 -ver_layers met2")
    t("global_placement -density 0.6")
    t("detailed_placement")
    t("estimate_parasitics -placement")
    stage("placed")
    t("repair_design")
    t("detailed_placement")
    t("estimate_parasitics -placement")
    t("repair_timing -setup")
    t("detailed_placement")
    t("estimate_parasitics -placement")
    stage("repaired")


if __name__ == "__main__":
    main(*sys.argv[1:])
