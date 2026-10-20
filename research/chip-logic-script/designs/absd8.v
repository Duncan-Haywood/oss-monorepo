module absd8(input [7:0] a, input [7:0] b, output [7:0] d);
  assign d = (a > b) ? (a - b) : (b - a);
endmodule
