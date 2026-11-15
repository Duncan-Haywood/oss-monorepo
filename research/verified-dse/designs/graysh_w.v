// Milestone 132 blind design: a W-bit left shifter whose SW-bit amount is a Gray-coded field decoded to binary, plus K SW-bit
// offsets (modulo 2^SW), s = gray2bin(g) + b0 + ... + b(K-1), as in shifting by a position read from a Gray-coded encoder or
// counter. The decode is a prefix xor chain (SW - 1 levels); K is a dial for gate depth.
module graysh_w #(parameter W = 128, parameter SW = 7, parameter K = 0)
    (input [W-1:0] x, input [SW-1:0] g, input [SW*(K>0?K:1)-1:0] b, output [W-1:0] y);
  wire [SW-1:0] d;
  genvar i;
  assign d[SW-1] = g[SW-1];
  generate for (i = SW - 2; i >= 0; i = i - 1) begin : dec
    assign d[i] = d[i+1] ^ g[i];
  end endgenerate
  wire [SW-1:0] acc [0:K];
  assign acc[0] = d;
  generate for (i = 0; i < K; i = i + 1) begin : add
    assign acc[i+1] = acc[i] + b[i*SW +: SW];
  end endgenerate
  assign y = x << acc[K];
endmodule
