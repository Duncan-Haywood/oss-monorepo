// Milestone 122 blind design: lane select by the first active request. z is the index of the lowest set bit of an N-bit request
// vector r (N when r = 0), found by a priority loop like lzcnorm_w's, and the W-bit word x is shifted right by z lanes of
// LANE bits. The amount comes from a priority encoder over an independent control vector, not from the data (unlike the
// normaliser). ZW = clog2(N + 1); LANE is a power of two, so z * LANE is a shift by a constant.
module tzcsh_w #(parameter W = 128, parameter N = 4, parameter ZW = 3, parameter LANE = 32)
    (input [W-1:0] x, input [N-1:0] r, output [W-1:0] y);
  integer i;
  reg [ZW-1:0] z;
  reg found;
  always @* begin
    z = N;
    found = 0;
    for (i = 0; i < N; i = i + 1)
      if (!found && r[i]) begin z = i; found = 1; end
  end
  assign y = x >> (z * LANE);
endmodule
