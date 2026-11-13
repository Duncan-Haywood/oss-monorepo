// Floating-point alignment shifter with sticky bit (a family no earlier table ran): y = x >> d, and sticky = OR of the bits shifted
// out (x & ((1 << d) - 1) != 0), the operand alignment step of a floating-point adder. DW = log2(W); d < W.
module alignsh_w #(parameter W = 64, parameter DW = 6) (input [W-1:0] x, input [DW-1:0] d, output [W-1:0] y, output sticky);
  wire [W-1:0] mask = ({{(W-1){1'b0}}, 1'b1} << d) - 1'b1;
  assign y = x >> d;
  assign sticky = |(x & mask);
endmodule
