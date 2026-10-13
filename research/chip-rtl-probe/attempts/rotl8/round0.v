module rotl8(input [7:0] a, input [2:0] n, output [7:0] y);
  assign y = (a << n) | (a >> (8 - n));
endmodule
