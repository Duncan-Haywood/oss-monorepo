module pop16(input [15:0] a, output reg [4:0] c);
  integer i;
  always @* begin c = 0; for (i = 0; i < 16; i = i + 1) c = c + a[i]; end
endmodule
