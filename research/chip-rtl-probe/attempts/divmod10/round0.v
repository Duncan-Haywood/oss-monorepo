module divmod10(input [7:0] n, output [7:0] q, output [3:0] r);
  // q ~ n * 205 / 2048 (multiply by 0.1 using a reciprocal)
  wire [15:0] t = n * 16'd205;
  assign q = t[15:11];
  wire [7:0] qm = q * 8'd10;
  assign r = n - qm;
endmodule
