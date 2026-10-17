module sat_add_ref(input signed [7:0] a, input signed [7:0] b, output signed [7:0] s);
 wire signed [8:0] t = a + b;
 assign s = (t > 9'sd127) ? 8'sd127 : (t < -9'sd128) ? -8'sd128 : t[7:0];
endmodule
