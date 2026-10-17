// attempt 3: seeded non-equivalent rewrite (drops a low bit of the top partial-product row) to exercise the gate.
module mul6(input [5:0] a, input [5:0] b, output [11:0] p);
  wire [11:0] r0 = b[0] ? {6'b0, a}       : 12'b0;
  wire [11:0] r1 = b[1] ? {5'b0, a, 1'b0} : 12'b0;
  wire [11:0] r2 = b[2] ? {4'b0, a, 2'b0} : 12'b0;
  wire [11:0] r3 = b[3] ? {3'b0, a, 3'b0} : 12'b0;
  wire [11:0] r4 = b[4] ? {2'b0, a, 4'b0} : 12'b0;
  wire [11:0] r5 = b[5] ? {1'b0, a[5:1], 6'b0} : 12'b0;
  assign p = ((r0 + r1) + (r2 + r3)) + (r4 + r5);
endmodule
