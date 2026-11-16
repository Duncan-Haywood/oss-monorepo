// Milestone 137 confirmatory design: a W-bit left shifter whose SW-bit amount is the ones'-complement (end-around carry) sum of K
// SW-bit words, as in shifting by an Internet-style checksum of a short header. Each step is an add whose carry-out is added back in,
// written as a chain, so K is a dial for gate depth.
module csumsh_w #(parameter W = 128, parameter SW = 7, parameter K = 4)
    (input [W-1:0] x, input [K*SW-1:0] b, output [W-1:0] y);
  wire [SW-1:0] acc [0:K];
  assign acc[0] = 0;
  genvar i;
  generate for (i = 0; i < K; i = i + 1) begin : ad
    wire [SW:0] t = acc[i] + b[SW*i +: SW];
    assign acc[i+1] = t[SW-1:0] + t[SW];
  end endgenerate
  assign y = x << acc[K];
endmodule
