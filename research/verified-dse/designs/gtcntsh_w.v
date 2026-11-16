// Milestone 138 confirmatory design: a W-bit shifter (left if R = 0, logical right if R = 1) whose SW-bit amount is the number of N
// NB-bit fields strictly greater than an NB-bit threshold t (modulo 2^SW), as in shifting by how many lanes exceed a level. One
// compare per field feeding a counter chain, so N is a dial for gate depth.
module gtcntsh_w #(parameter W = 128, parameter SW = 7, parameter N = 8, parameter NB = 6, parameter R = 0)
    (input [W-1:0] x, input [N*NB-1:0] f, input [NB-1:0] t, output [W-1:0] y);
  wire [SW-1:0] c [0:N];
  assign c[0] = 0;
  genvar i;
  generate for (i = 0; i < N; i = i + 1) begin : ct
    assign c[i+1] = c[i] + (f[NB*i +: NB] > t);
  end endgenerate
  assign y = R ? (x >> c[N]) : (x << c[N]);
endmodule
