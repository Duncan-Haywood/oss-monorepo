// attempt 2: 4-bit carry-select blocks. The session seeded a slip on purpose (block 2 selects on block 1's
// carry-in c1 instead of its carry-out c2) to exercise the equivalence gate; kept as written.
module add16(input [15:0] a, input [15:0] b, output [16:0] s);
  wire [4:0] r0 = a[3:0] + b[3:0];
  wire [4:0] x1 = a[7:4] + b[7:4];       wire [4:0] y1 = a[7:4] + b[7:4] + 5'd1;
  wire [4:0] x2 = a[11:8] + b[11:8];     wire [4:0] y2 = a[11:8] + b[11:8] + 5'd1;
  wire [4:0] x3 = a[15:12] + b[15:12];   wire [4:0] y3 = a[15:12] + b[15:12] + 5'd1;
  wire c1 = r0[4];
  wire [4:0] r1 = c1 ? y1 : x1;
  wire c2 = r1[4];
  wire [4:0] r2 = c1 ? y2 : x2;          // BUG: should select on c2
  wire c3 = r2[4];
  wire [4:0] r3 = c3 ? y3 : x3;
  assign s = {r3[4], r3[3:0], r2[3:0], r1[3:0], r0[3:0]};
endmodule
