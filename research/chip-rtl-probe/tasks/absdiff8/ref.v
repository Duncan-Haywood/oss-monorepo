module absdiff8_ref(input signed [7:0] a, input signed [7:0] b, output [8:0] y);
  wire signed [9:0] d = a - b;
  assign y = d < 0 ? -d : d;
endmodule
