// Integrated clock gate. Behavioural (latch + AND) for simulation and generic synthesis; with -DSKY130 it is the
// SKY130 HD library cell, so Yosys keeps it as a black box and counts its liberty area.
module icg (input wire clk, input wire en, output wire gclk);
`ifdef SKY130
    sky130_fd_sc_hd__dlclkp_1 u (.CLK(clk), .GATE(en), .GCLK(gclk));
`else
    reg l;
    always @* if (!clk) l = en;
    assign gclk = clk & l;
`endif
endmodule
