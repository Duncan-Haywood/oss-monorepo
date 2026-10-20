module clz16(input [15:0] a, output reg [4:0] n);
  integer i;
  always @* begin
    n = 16;
    for (i = 0; i < 16; i = i + 1) if (a[i]) n = 15 - i;
  end
endmodule
