// Milestone 124 blind design: a W-bit right shifter whose SW-bit amount is the largest of N SW-bit fields, as in shifting by the
// worst-case exponent or the longest of N lane lengths. Written as a linear compare-select chain (m = max(m, f[i])); synthesis is
// free to rebalance it. Each step is one comparator and one SW-bit mux, so N is a dial for gate-level depth.
module maxsh_w #(parameter W = 128, parameter SW = 7, parameter N = 4)
    (input [W-1:0] x, input [SW*N-1:0] f, output [W-1:0] y);
  integer i;
  reg [SW-1:0] m;
  always @* begin
    m = f[SW-1:0];
    for (i = 1; i < N; i = i + 1) if (f[i*SW +: SW] > m) m = f[i*SW +: SW];
  end
  assign y = x >> m;
endmodule
