// attempt 1: carry-save (3:2 compressor) tree over the six partial products, one final `+`.
module mul6(input [5:0] a, input [5:0] b, output [11:0] p);
  wire [11:0] r0 = b[0] ? {6'b0, a}       : 12'b0;
  wire [11:0] r1 = b[1] ? {5'b0, a, 1'b0} : 12'b0;
  wire [11:0] r2 = b[2] ? {4'b0, a, 2'b0} : 12'b0;
  wire [11:0] r3 = b[3] ? {3'b0, a, 3'b0} : 12'b0;
  wire [11:0] r4 = b[4] ? {2'b0, a, 4'b0} : 12'b0;
  wire [11:0] r5 = b[5] ? {1'b0, a, 5'b0} : 12'b0;
  // level 1: (r0,r1,r2) -> s1,c1 ; (r3,r4,r5) -> s2,c2
  wire [11:0] s1 = r0 ^ r1 ^ r2, c1 = ((r0 & r1) | (r0 & r2) | (r1 & r2)) << 1;
  wire [11:0] s2 = r3 ^ r4 ^ r5, c2 = ((r3 & r4) | (r3 & r5) | (r4 & r5)) << 1;
  // level 2: (s1,c1,s2) -> s3,c3
  wire [11:0] s3 = s1 ^ c1 ^ s2, c3 = ((s1 & c1) | (s1 & s2) | (c1 & s2)) << 1;
  // level 3: (s3,c3,c2) -> s4,c4
  wire [11:0] s4 = s3 ^ c3 ^ c2, c4 = ((s3 & c3) | (s3 & c2) | (c3 & c2)) << 1;
  assign p = s4 + c4;
endmodule
