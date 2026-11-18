// Milestone 122 blind design: a W-bit right shifter whose SW-bit amount is a short address-generation chain over three pins:
// s = a, then K rounds of s = (s ^ b) + c. Each round is two word-level cells (an xor and an add), so the amount's word-level
// depth is about 2K, a dial for testing where between depth 2 and 63 the clipped ladder starts to rank shifters.
module chainsh_w #(parameter W = 128, parameter SW = 7, parameter K = 2)
    (input [W-1:0] x, input [SW-1:0] a, input [SW-1:0] b, input [SW-1:0] c, output [W-1:0] y);
  integer i;
  reg [SW-1:0] s;
  always @* begin
    s = a;
    for (i = 0; i < K; i = i + 1) s = (s ^ b) + c;
  end
  assign y = x >> s;
endmodule
