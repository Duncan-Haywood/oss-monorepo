// Population count of 12 bits.
module popcnt12(input [11:0] x, output [3:0] y);
  assign y = x[0]+x[1]+x[2]+x[3]+x[4]+x[5]+x[6]+x[7]+x[8]+x[9]+x[10]+x[11];
endmodule
