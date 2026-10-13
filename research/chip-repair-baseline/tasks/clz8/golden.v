module clz8_ref(input [7:0] x, output reg [3:0] n);
  integer i;
  always @* begin n = 8; for (i = 0; i < 8; i = i + 1) if (x[i]) n = 7 - i; end
endmodule
