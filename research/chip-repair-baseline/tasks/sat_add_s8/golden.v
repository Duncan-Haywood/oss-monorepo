module sat_add_s8_ref(input signed [7:0] a, input signed [7:0] b, output signed [7:0] s);
  wire signed [8:0] t = a + b;
  assign s = (t > 127) ? 8'sd127 : (t < -128) ? -8'sd128 : t[7:0];
endmodule
