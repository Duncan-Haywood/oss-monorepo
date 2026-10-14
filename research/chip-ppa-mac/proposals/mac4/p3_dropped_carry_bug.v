// Proposal 3 (seeded fault): c is truncated to 7 bits, so the equivalence gate must reject it.
module mac4(input [3:0] a, input [3:0] b, input [7:0] c, output [8:0] y);
  assign y = a * b + {2'b0, c[6:0]};
endmodule
