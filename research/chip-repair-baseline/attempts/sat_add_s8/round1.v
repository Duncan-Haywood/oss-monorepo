module sat_add_s8(input [7:0] a, input [7:0] b, output reg [7:0] s);
  wire [7:0] sum = a + b;
  always @* begin
    if (a[7] == b[7] && sum[7] != a[7])
      s = a[7] ? 8'h80 : 8'h7F;
    else
      s = sum;
  end
endmodule
