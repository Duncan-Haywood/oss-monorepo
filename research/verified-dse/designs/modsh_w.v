// Milestone 132 blind design: a W-bit right shifter whose SW-bit amount is an NA-bit value reduced modulo a constant M < 2^SW,
// s = a mod M, as in shifting by a ring-buffer or bank index. The constant divider is a dial for gate depth through NA.
module modsh_w #(parameter W = 128, parameter SW = 7, parameter NA = 12, parameter M = 97)
    (input [W-1:0] x, input [NA-1:0] a, output [W-1:0] y);
  wire [NA-1:0] r = a % M;
  wire [SW-1:0] s = r[SW-1:0];
  assign y = x >> s;
endmodule
