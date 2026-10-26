// Parameterised population count.
module popcount_w #(parameter W = 16, parameter NW = 5) (input [W-1:0] x, output [NW-1:0] n);
  integer i;
  reg [NW-1:0] t;
  always @* begin t = 0; for (i = 0; i < W; i = i + 1) t = t + x[i]; end
  assign n = t;
endmodule
