// 16-bit logical barrel shifter, left or right.
module barrel16(input [15:0] x, input [3:0] s, input left, output [15:0] y);
  assign y = left ? (x << s) : (x >> s);
endmodule
