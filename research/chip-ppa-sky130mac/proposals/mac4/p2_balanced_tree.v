// Proposal 2: balanced adder tree over the five rows.
module mac4(input [3:0] a, input [3:0] b, input [7:0] c, output [8:0] y);
  wire [8:0] r0 = b[0] ? {5'b0, a} : 9'b0;
  wire [8:0] r1 = b[1] ? {4'b0, a, 1'b0} : 9'b0;
  wire [8:0] r2 = b[2] ? {3'b0, a, 2'b0} : 9'b0;
  wire [8:0] r3 = b[3] ? {2'b0, a, 3'b0} : 9'b0;
  assign y = ((r0 + r1) + (r2 + r3)) + {1'b0, c};
endmodule
