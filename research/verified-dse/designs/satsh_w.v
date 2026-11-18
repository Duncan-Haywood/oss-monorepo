// Milestone 124 blind design: a W-bit right shifter whose SW-bit amount is a chain of K saturating adds,
// s = sat(sat(a + b0) + b1) ..., each clamped to 2^SW - 1 on carry-out, as in an accumulated, clamped shift count. Each step is an
// SW-bit adder whose carry-out selects the clamp, so the carry chain and the clamp mux are both in series. K is a dial for gate depth.
module satsh_w #(parameter W = 128, parameter SW = 7, parameter K = 2)
    (input [W-1:0] x, input [SW-1:0] a, input [SW*K-1:0] b, output [W-1:0] y);
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
  assign y = x >> s;
endmodule
