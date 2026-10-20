module absd8(input [7:0] a, input [7:0] b, output [7:0] d);
  wire g = a > b;
  wire [7:0] hi = g ? a : b, lo = g ? b : a;
  assign d = hi - lo;
endmodule
