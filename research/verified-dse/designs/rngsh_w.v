// Milestone 138 confirmatory design: a W-bit shifter (left if R = 0, logical right if R = 1) whose SW-bit amount is the low SW bits of
// the range max - min of N NB-bit fields, as in normalising by the spread of a window. Running max and min are compare-select
// chains, so N is a dial for gate depth.
module rngsh_w #(parameter W = 128, parameter SW = 7, parameter N = 4, parameter NB = 8, parameter R = 0)
    (input [W-1:0] x, input [N*NB-1:0] f, output [W-1:0] y);
  wire [NB-1:0] mx [0:N-1];
  wire [NB-1:0] mn [0:N-1];
  assign mx[0] = f[NB-1:0];
  assign mn[0] = f[NB-1:0];
  genvar i;
  generate for (i = 1; i < N; i = i + 1) begin : ch
    wire [NB-1:0] v = f[NB*i +: NB];
    assign mx[i] = (v > mx[i-1]) ? v : mx[i-1];
    assign mn[i] = (v < mn[i-1]) ? v : mn[i-1];
  end endgenerate
  wire [NB-1:0] r = mx[N-1] - mn[N-1];
  wire [SW-1:0] s = r;
  assign y = R ? (x >> s) : (x << s);
endmodule
