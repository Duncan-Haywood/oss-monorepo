// Parameterised logical barrel shifter, left or right (W a power of two).
module barrel_w #(parameter W = 16, parameter SW = 4) (input [W-1:0] x, input [SW-1:0] s, input left, output [W-1:0] y);
  assign y = left ? (x << s) : (x >> s);
endmodule
