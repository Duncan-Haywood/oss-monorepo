// Proposal 0: the four partial products and c reduced by 3:2 carry-save adders, then one final adder.
module mac4(input [3:0] a, input [3:0] b, input [7:0] c, output [8:0] y);
  wire [8:0] r0 = b[0] ? {5'b0, a} : 9'b0;
  wire [8:0] r1 = b[1] ? {4'b0, a, 1'b0} : 9'b0;
  wire [8:0] r2 = b[2] ? {3'b0, a, 2'b0} : 9'b0;
  wire [8:0] r3 = b[3] ? {2'b0, a, 3'b0} : 9'b0;
  wire [8:0] c0 = {1'b0, c};
  wire [8:0] s1 = r0 ^ r1 ^ c0;  wire [8:0] k1 = ((r0 & r1) | (r0 & c0) | (r1 & c0)) << 1;
  wire [8:0] s2 = s1 ^ r2 ^ k1;  wire [8:0] k2 = ((s1 & r2) | (s1 & k1) | (r2 & k1)) << 1;
  wire [8:0] s3 = s2 ^ r3 ^ k2;  wire [8:0] k3 = ((s2 & r3) | (s2 & k2) | (r3 & k2)) << 1;
  assign y = s3 + k3;
endmodule
