module absd8(input [7:0] a, input [7:0] b, output [7:0] d);
  wire [7:0] ab = a - b, ba = b - a;
  assign d = (a < b) ? ba : ab;
endmodule
