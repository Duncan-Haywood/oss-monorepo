// Milestone 125 blind design: a W-bit right shifter whose SW-bit amount is picked by a magnitude compare of two NP-bit keys,
// s = (p > q) ? a : b, as in shifting by the exponent of the larger of two operands' keys. The comparator sits in front of one
// SW-bit mux. NP is a dial for gate depth.
module selsh_w #(parameter W = 128, parameter SW = 7, parameter NP = 16)
    (input [W-1:0] x, input [NP-1:0] p, input [NP-1:0] q, input [SW-1:0] a, input [SW-1:0] b, output [W-1:0] y);
  wire [SW-1:0] s = (p > q) ? a : b;
  assign y = x >> s;
endmodule
