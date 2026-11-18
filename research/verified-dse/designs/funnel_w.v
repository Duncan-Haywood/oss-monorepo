// Funnel shifter (a family no earlier table ran): the low W bits of the 2W-bit word {hi, lo} shifted right by s. With hi = lo it is a
// rotate; it is the shifter used for rotates and double-word shifts in CPU datapaths, and differs from barrel_w (a zero-fill shift).
module funnel_w #(parameter W = 64, parameter SW = 6) (input [W-1:0] hi, input [W-1:0] lo, input [SW-1:0] s, output [W-1:0] y);
  wire [2*W-1:0] t = {hi, lo} >> s;
  assign y = t[W-1:0];
endmodule
