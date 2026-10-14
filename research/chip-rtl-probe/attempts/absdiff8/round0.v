module absdiff8(input signed [7:0] a, input signed [7:0] b, output [8:0] y);
  assign y = (a > b) ? (a - b) : (b - a);
endmodule
