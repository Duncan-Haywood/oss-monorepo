// Reference: 4x4 unsigned multiply-accumulate, y = a*b + c (c is 8 bits, y is 9 bits).
module mac4(input [3:0] a, input [3:0] b, input [7:0] c, output [8:0] y);
  assign y = a * b + c;
endmodule
