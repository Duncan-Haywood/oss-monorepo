// Logarithmic left/right shifter written as explicit 2:1 mux stages, with no shift operator (a family no earlier table ran). It
// computes the same function as barrel_w (y = left ? x << s : x >> s), but its RTL carries no word-level shift cell, so milestone
// 119's structural feature (shift_width) cannot see it: the guard's disclosed blind spot. W a power of two, SW = log2(W).
module muxshl_w #(parameter W = 64, parameter SW = 6) (input [W-1:0] x, input [SW-1:0] s, input left, output [W-1:0] y);
  wire [W-1:0] st [0:SW];
  assign st[0] = x;
  genvar k, i;
  generate for (k = 0; k < SW; k = k + 1) begin : stage
    for (i = 0; i < W; i = i + 1) begin : b
      wire lv = (i >= (1 << k)) ? st[k][(i >= (1 << k)) ? i - (1 << k) : 0] : 1'b0;
      wire rv = (i + (1 << k) < W) ? st[k][(i + (1 << k) < W) ? i + (1 << k) : 0] : 1'b0;
      assign st[k + 1][i] = s[k] ? (left ? lv : rv) : st[k][i];
    end
  end endgenerate
  assign y = st[SW];
endmodule
