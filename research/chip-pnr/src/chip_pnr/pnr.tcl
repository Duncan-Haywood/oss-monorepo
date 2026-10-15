# OpenROAD place-and-route for one mapped netlist. Variables come from the environment:
# PLATFORM, NETLIST, TOP, PERIOD_NS, UTIL (core utilisation %), OUTDIR, CLK_PORT ("" for combinational)
set plat $::env(PLATFORM)
set top $::env(TOP)
set out $::env(OUTDIR)
set period $::env(PERIOD_NS)
read_liberty $::env(LIBERTY)
read_lef $plat/lef/sky130_fd_sc_hd.tlef
read_lef $plat/lef/sky130_fd_sc_hd_merged.lef
read_verilog $::env(NETLIST)
link_design $top

if {$::env(CLK_PORT) ne ""} {
  create_clock -name clk -period $period [get_ports $::env(CLK_PORT)]
  foreach p [all_inputs] {
    if {[get_name $p] ne $::env(CLK_PORT)} { set_input_delay 0 -clock clk $p }
  }
  set_output_delay 0 -clock clk [all_outputs]
} else {
  create_clock -name vclk -period $period
  set_input_delay 0 -clock vclk [all_inputs]
  set_output_delay 0 -clock vclk [all_outputs]
}


# Pre-placement timing: no wires, ideal clock (what synthesis-level STA sees).
source $plat/setRC.tcl
puts "STAGE synth_netlist"
report_design_area
report_worst_slack -max
report_checks -path_delay max -format end -group_path_count 1

initialize_floorplan -utilization $::env(UTIL) -aspect_ratio 1 -core_space 2 -site unithd
source $plat/make_tracks.tcl
tapcell -distance 14 -tapcell_master sky130_fd_sc_hd__tapvpwrvgnd_1
global_placement -skip_io -density 0.6
puts "STAGE global_place"
estimate_parasitics -placement
report_design_area
report_worst_slack -max

place_pins -hor_layers met3 -ver_layers met2
global_placement -density 0.6
detailed_placement
if {$::env(CLK_PORT) ne ""} {
  clock_tree_synthesis -root_buf sky130_fd_sc_hd__clkbuf_4 -buf_list sky130_fd_sc_hd__clkbuf_4
  set_propagated_clock [get_clocks clk]
}
repair_design
detailed_placement
estimate_parasitics -placement
puts "STAGE detail_place"
report_design_area
report_worst_slack -max

set_global_routing_layer_adjustment met1-met5 0.5
set_routing_layers -signal met1-met5 -clock met1-met5
global_route -allow_congestion
estimate_parasitics -global_routing
repair_timing -setup -verbose
detailed_placement
puts "STAGE final"
report_design_area
report_worst_slack -max
report_tns
report_checks -path_delay max -format end -group_path_count 1
puts "STAGE usage"
report_cell_usage
report_power
write_def $out/$top.def
