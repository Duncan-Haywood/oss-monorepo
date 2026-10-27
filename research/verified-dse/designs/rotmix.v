// 64-bit barrel rotate then a 64-bit conditional XOR with a second rotated copy (long-wire shifter plus broadcast select).
module rotmix (input [63:0] a, input [5:0] s, input [5:0] t, input m, output [63:0] y);
  wire [127:0] aa = {a, a};
  wire [63:0] r1 = aa[s +: 64];
  wire [63:0] r2 = aa[t +: 64];
  assign y = r1 ^ ({64{m}} & r2);
endmodule
