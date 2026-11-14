// Milestone 125 blind design: L lanes of a W-bit right shifter that share one SW-bit amount, the result of K chained SW-bit
// saturating adds (the amount cone of designs/satsh_w.v), as in a SIMD shift by a common, clamped count. Each lane is its own W-bit
// shift, so the widest shift cell stays W bits while the wiring grows with L. L is a dial for how wire-bound a 64-bit shift is.
module lanesh_w #(parameter W = 64, parameter SW = 6, parameter K = 2, parameter L = 4)
    (input [W*L-1:0] x, input [SW-1:0] a, input [SW*K-1:0] b, output [W*L-1:0] y);
  integer i;
  reg [SW:0] t;
  reg [SW-1:0] s;
  always @* begin
    s = a;
    for (i = 0; i < K; i = i + 1) begin
      t = {1'b0, s} + {1'b0, b[i*SW +: SW]};
      s = t[SW] ? {SW{1'b1}} : t[SW-1:0];
    end
  end
  genvar j;
  generate for (j = 0; j < L; j = j + 1) begin : lane
    assign y[j*W +: W] = x[j*W +: W] >> s;
  end endgenerate
endmodule
