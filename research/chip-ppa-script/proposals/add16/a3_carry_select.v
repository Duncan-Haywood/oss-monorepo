// attempt 3: attempt 2 with the seeded slip fixed (block 2 selects on block 1's carry-out).
module add16(input [15:0] a, input [15:0] b, output [16:0] s);
  wire [4:0] r0 = a[3:0] + b[3:0];
  wire [4:0] x1 = a[7:4] + b[7:4];       wire [4:0] y1 = a[7:4] + b[7:4] + 5'd1;
  wire [4:0] x2 = a[11:8] + b[11:8];     wire [4:0] y2 = a[11:8] + b[11:8] + 5'd1;
  wire [4:0] x3 = a[15:12] + b[15:12];   wire [4:0] y3 = a[15:12] + b[15:12] + 5'd1;
  wire [4:0] r1 = r0[4] ? y1 : x1;
  wire [4:0] r2 = r1[4] ? y2 : x2;
  wire [4:0] r3 = r2[4] ? y3 : x3;
  assign s = {r3[4], r3[3:0], r2[3:0], r1[3:0], r0[3:0]};
endmodule
