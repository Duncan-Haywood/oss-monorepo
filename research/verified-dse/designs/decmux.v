// 6-to-64 one-hot decoder gating a 64:1 AND-OR multiplexer over a 64-bit input word (wiring-dominated).
module decmux (input [63:0] d, input [5:0] s, output y);
  wire [63:0] oh = 64'b1 << s;
  assign y = |(d & oh);
endmodule
