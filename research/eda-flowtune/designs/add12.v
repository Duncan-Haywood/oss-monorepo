// 12-bit adder with carry in and carry out.
module add12(input [11:0] a, input [11:0] b, input cin, output [12:0] y);
  assign y = a + b + cin;
endmodule
