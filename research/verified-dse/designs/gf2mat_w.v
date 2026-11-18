// Parameterised N x N GF(2) matrix-vector product (N <= 64); the rows come from the same 64-bit LFSR as designs/gf2mat.v,
// so N = 48 reproduces it. Milestone 113 uses unseen sizes.
module gf2mat_w #(parameter N = 48) (input [N-1:0] x, output [N-1:0] y);
  function [63:0] row(input integer r);
    reg [63:0] s; integer k;
    begin
      s = 64'hace1_0f3c_9d27_b5e1 ^ (64'h9e37_79b9_7f4a_7c15 * (r + 1));
      for (k = 0; k < 40; k = k + 1) s = {s[62:0], s[63] ^ s[62] ^ s[60] ^ s[59]};
      row = s;
    end
  endfunction
  genvar i;
  generate for (i = 0; i < N; i = i + 1) begin : g
    wire [63:0] r = row(i);
    assign y[i] = ^(x & r[N-1:0]);
  end endgenerate
endmodule
