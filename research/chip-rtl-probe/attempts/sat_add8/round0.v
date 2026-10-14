module sat_add8(input [7:0] a, input [7:0] b, output [7:0] y);
  wire [8:0] s = a + b;
  assign y = s[8] ? 8'hFF : s[7:0];
endmodule
