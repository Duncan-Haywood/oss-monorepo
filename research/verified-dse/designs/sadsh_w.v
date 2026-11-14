// Milestone 124 blind design: a W-bit left shifter whose SW-bit amount is the sum of K absolute differences of SW-bit pairs
// (modulo 2^SW), s = |a0 - b0| + ... + |a(K-1) - b(K-1)|, as in a distance-scaled shift. Each term is a subtract, a sign test and
// a conditional negate; the sum is a chain of K - 1 adders. K is a dial for gate-level depth.
module sadsh_w #(parameter W = 128, parameter SW = 7, parameter K = 2)
    (input [W-1:0] x, input [SW*K-1:0] a, input [SW*K-1:0] b, output [W-1:0] y);
  integer i;
  reg [SW-1:0] s, ai, bi;
  always @* begin
    s = 0;
    for (i = 0; i < K; i = i + 1) begin
      ai = a[i*SW +: SW];
      bi = b[i*SW +: SW];
      s = s + ((ai > bi) ? ai - bi : bi - ai);
    end
  end
  assign y = x << s;
endmodule
