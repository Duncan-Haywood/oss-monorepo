module absd8(input [7:0] a, input [7:0] b, output [7:0] d);
  // |a-b| = (a-b) XOR borrow, plus borrow  (two's-complement negate when a<b)
  wire [8:0] t = {1'b0, a} - {1'b0, b};
  wire bw = t[8];
  assign d = (t[7:0] ^ {8{bw}}) + {7'b0, bw};
endmodule
