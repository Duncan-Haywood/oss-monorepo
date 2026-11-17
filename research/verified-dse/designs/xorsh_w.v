// Milestone 123 blind design: a W-bit right shifter whose SW-bit amount is the xor of K SW-bit fields, as in a hashed or
// scrambled lane select (s = a ^ b[0] ^ ... ^ b[K-2], written as a chain). Each term is one word-level $xor cell, so the
// amount's word-level depth is K - 1, but each cell is a single gate level per bit: many word-level cells, few gates.
module xorsh_w #(parameter W = 128, parameter SW = 7, parameter K = 4)
    (input [W-1:0] x, input [SW-1:0] a, input [SW*(K-1)-1:0] b, output [W-1:0] y);
  integer i;
  reg [SW-1:0] s;
  always @* begin
    s = a;
    for (i = 0; i < K - 1; i = i + 1) s = s ^ b[i*SW +: SW];
  end
  assign y = x >> s;
endmodule
