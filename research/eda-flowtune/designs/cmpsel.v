// Max of two 8-bit values plus an equality flag.
module cmpsel(input [7:0] a, input [7:0] b, output [7:0] y, output eq);
  assign y = (a > b) ? a : b;
  assign eq = (a == b);
endmodule
