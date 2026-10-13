module popcount8_ref(input [7:0] x, output reg [3:0] y);
  integer i;
  always @* begin y = 0; for (i = 0; i < 8; i = i + 1) y = y + x[i]; end
endmodule
