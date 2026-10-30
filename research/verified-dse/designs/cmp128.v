// 128-bit unsigned a<b and a==b, written as a carry chain Yosys can re-balance.
module cmp128 (input [127:0] a, input [127:0] b, output lt, output eq);
  assign lt = a < b;
  assign eq = a == b;
endmodule
