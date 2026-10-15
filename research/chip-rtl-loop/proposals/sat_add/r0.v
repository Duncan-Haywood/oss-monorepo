module sat_add(input signed [7:0] a, input signed [7:0] b, output signed [7:0] s);
  wire signed [7:0] sum = a + b;
  wire ovf = (a[7] == b[7]) && (sum[7] != a[7]);
  assign s = ovf ? (a[7] ? 8'sh80 : 8'sh7f) : sum;
endmodule
