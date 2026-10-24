// Saturating signed 12-bit add with max/min select.
module cmp_sat(input signed [11:0] a, b, output signed [11:0] s, output gt);
  wire signed [12:0] t = a + b;
  assign s = (t > 13'sd2047) ? 12'sd2047 : (t < -13'sd2048) ? -12'sd2048 : t[11:0];
  assign gt = a > b;
endmodule
