module absd8(input [7:0] a, input [7:0] b, output [7:0] d);
  wire [8:0] t = {1'b0, a} - {1'b0, b};
  assign d = t[8] ? (~t[7:0] + 8'd1) : t[7:0];
endmodule
