// Milestone 125 blind design: a W-bit right shifter whose SW-bit amount is the top bits of a three-operand sum,
// s = (a + b + c) >> (NB + 2 - SW) with NB-bit operands, as in an averaged shift count. Two adders in series (or a carry-save step
// and one adder after synthesis). NB is a dial for gate depth.
module avgsh_w #(parameter W = 128, parameter SW = 7, parameter NB = 9)
    (input [W-1:0] x, input [NB-1:0] a, input [NB-1:0] b, input [NB-1:0] c, output [W-1:0] y);
  wire [NB+1:0] t = a + b + c;
  wire [SW-1:0] s = t[NB+1 -: SW];
  assign y = x >> s;
endmodule
