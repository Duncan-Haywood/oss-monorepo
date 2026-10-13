module div8_ref(input [7:0] n, input [7:0] d, output [7:0] q, output [7:0] r);
  assign q = (d == 0) ? 8'hFF : n / d;
  assign r = (d == 0) ? n : n % d;
endmodule
