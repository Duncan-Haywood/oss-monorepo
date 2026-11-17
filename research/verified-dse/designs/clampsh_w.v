// Milestone 138 confirmatory design: a W-bit shifter (left if R = 0, logical right if R = 1) whose SW-bit amount is the low SW bits of
// min(max(a, lo), hi) for NB-bit a, lo and hi, applied K times in a chain with the next word's bounds (clamp, then add the next
// offset, clamp again), as in a saturating pointer update. K is a dial for gate depth.
module clampsh_w #(parameter W = 128, parameter SW = 7, parameter NB = 8, parameter K = 2, parameter R = 0)
    (input [W-1:0] x, input [K*NB-1:0] a, input [K*NB-1:0] lo, input [K*NB-1:0] hi, output [W-1:0] y);
  wire [NB-1:0] acc [0:K];
  assign acc[0] = 0;
  genvar i;
  generate for (i = 0; i < K; i = i + 1) begin : cl
    wire [NB-1:0] v = acc[i] + a[NB*i +: NB];
    wire [NB-1:0] l = lo[NB*i +: NB], h = hi[NB*i +: NB];
    wire [NB-1:0] m = (v < l) ? l : v;
    assign acc[i+1] = (m > h) ? h : m;
  end endgenerate
  wire [SW-1:0] s = acc[K];
  assign y = R ? (x >> s) : (x << s);
endmodule
