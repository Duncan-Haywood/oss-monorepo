module absdiff8(input [7:0] a, input [7:0] b, output [7:0] d);
  wire [8:0] diff = a - b;
  assign d = diff[8] ? -diff[7:0] : diff[7:0];
endmodule
