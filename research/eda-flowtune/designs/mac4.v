// y = a*b + c (4x4 multiply-accumulate); same function as chip-ppa-sky130mac/designs/mac4.v.
module mac4(input [3:0] a, input [3:0] b, input [7:0] c, output [8:0] y);
  assign y = a * b + c;
endmodule
