// Milestone 123 blind design: a W-bit right shifter whose SW-bit amount is the top SW bits of a K-term sum of OW-bit operands,
// s = a + b[0] + ... + b[K-2] (K - 1 adders in a chain, as in base + index + offset address generation with the shift taken
// from the high bits). Its word-level amount depth is K - 1 whatever OW is, so OW is a dial for gate-level depth alone: at
// OW = SW the adders are narrow, at OW = 32 each one carries a 32-bit chain into the bits the shifter uses.
module wsumsh_w #(parameter W = 128, parameter SW = 7, parameter OW = 32, parameter K = 3)
    (input [W-1:0] x, input [OW-1:0] a, input [OW*(K-1)-1:0] b, output [W-1:0] y);
  integer i;
  reg [OW-1:0] s;
  always @* begin
    s = a;
    for (i = 0; i < K - 1; i = i + 1) s = s + b[i*OW +: OW];
  end
  assign y = x >> s[OW-1 -: SW];
endmodule
