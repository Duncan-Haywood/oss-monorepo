// Sum of absolute differences of two 4-bit pairs.
module sad2(input [3:0] a0, input [3:0] b0, input [3:0] a1, input [3:0] b1, output [4:0] y);
  wire [3:0] d0 = (a0 > b0) ? a0 - b0 : b0 - a0;
  wire [3:0] d1 = (a1 > b1) ? a1 - b1 : b1 - a1;
  assign y = d0 + d1;
endmodule
