module divmod10_ref(input [7:0] n, output [7:0] q, output [3:0] r);
  assign q = n / 8'd10;
  assign r = n % 8'd10;
endmodule
