// Population count of a 16-bit word.
module popcount16(input [15:0] x, output [4:0] n);
  integer i;
  reg [4:0] t;
  always @* begin t = 0; for (i = 0; i < 16; i = i + 1) t = t + x[i]; end
  assign n = t;
endmodule
