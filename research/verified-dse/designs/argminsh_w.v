// Milestone 137 confirmatory design: a W-bit left shifter whose SW-bit amount is the INDEX of the smallest of N NB-bit fields (the
// first one on ties), as in shifting a lane to the position of its least-loaded or earliest-deadline slot. Written as a linear
// compare-select chain carrying the running minimum and its index, so N is a dial for gate depth. N <= 2^SW.
module argminsh_w #(parameter W = 128, parameter SW = 7, parameter N = 8, parameter NB = 6)
    (input [W-1:0] x, input [N*NB-1:0] f, output [W-1:0] y);
  wire [NB-1:0] m [0:N-1];
  wire [SW-1:0] k [0:N-1];
  assign m[0] = f[NB-1:0];
  assign k[0] = 0;
  genvar i;
  generate for (i = 1; i < N; i = i + 1) begin : ch
    wire lt = f[NB*i +: NB] < m[i-1];
    assign m[i] = lt ? f[NB*i +: NB] : m[i-1];
    assign k[i] = lt ? i[SW-1:0] : k[i-1];
  end endgenerate
  assign y = x << k[N-1];
endmodule
