// Milestone 138 confirmatory design: a W-bit shifter (left if R = 0, logical right if R = 1) whose SW-bit amount is the dot product,
// modulo 2^SW, of two vectors of K 3-bit unsigned entries, as in shifting by a small weighted score. The products are summed in a
// chain, so K is a dial for gate depth.
module dotsh_w #(parameter W = 128, parameter SW = 7, parameter K = 4, parameter R = 0)
    (input [W-1:0] x, input [3*K-1:0] p, input [3*K-1:0] q, output [W-1:0] y);
  wire [SW-1:0] acc [0:K];
  assign acc[0] = 0;
  genvar i;
  generate for (i = 0; i < K; i = i + 1) begin : dp
    wire [5:0] m = p[3*i +: 3] * q[3*i +: 3];
    assign acc[i+1] = acc[i] + m;
  end endgenerate
  assign y = R ? (x >> acc[K]) : (x << acc[K]);
endmodule
