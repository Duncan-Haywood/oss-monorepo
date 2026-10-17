module gray2bin(input [7:0] g, output [7:0] b);
  assign b = g ^ (g >> 1);
endmodule
