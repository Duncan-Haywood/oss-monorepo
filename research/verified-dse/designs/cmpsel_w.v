// Milestone 133 blind design: a W-bit left shifter whose SW-bit amount is one of two candidate amounts chosen by an NP-bit
// unsigned comparison, s = (p < q) ? a : b, as in shifting by whichever operand's exponent wins. The comparator width NP is a
// dial for gate depth.
module cmpsel_w #(parameter W = 128, parameter SW = 7, parameter NP = 16)
    (input [W-1:0] x, input [NP-1:0] p, input [NP-1:0] q, input [SW-1:0] a, input [SW-1:0] b, output [W-1:0] y);
  wire [SW-1:0] s = (p < q) ? a : b;
  assign y = x << s;
endmodule
