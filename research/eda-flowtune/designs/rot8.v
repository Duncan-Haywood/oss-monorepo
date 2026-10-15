// 8-bit barrel rotate left by s.
module rot8(input [7:0] x, input [2:0] s, output [7:0] y);
  wire [15:0] d = {x, x} << s;
  assign y = d[15:8];
endmodule
