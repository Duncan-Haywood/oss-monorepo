// 48x48 GF(2) matrix-vector product, fixed dense matrix from a 64-bit LFSR: every input bit feeds about 24 XOR trees.
module gf2mat (input [47:0] x, output [47:0] y);
  function [47:0] row(input integer r);
    reg [63:0] s; integer k;
    begin
      s = 64'hace1_0f3c_9d27_b5e1 ^ (64'h9e37_79b9_7f4a_7c15 * (r + 1));
      for (k = 0; k < 40; k = k + 1) s = {s[62:0], s[63] ^ s[62] ^ s[60] ^ s[59]};
      row = s[47:0];
    end
  endfunction
  genvar i;
  generate for (i = 0; i < 48; i = i + 1) begin : g
    assign y[i] = ^(x & row(i));
  end endgenerate
endmodule
