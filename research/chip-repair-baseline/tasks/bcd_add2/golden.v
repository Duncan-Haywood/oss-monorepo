module bcd_add2_ref(input [7:0] a, input [7:0] b, input cin, output [7:0] s, output cout);
  wire [7:0] av = a[7:4] * 10 + a[3:0];
  wire [7:0] bv = b[7:4] * 10 + b[3:0];
  wire [8:0] t = av + bv + cin;
  wire [8:0] u = (t >= 100) ? t - 100 : t;
  assign cout = (t >= 100);
  wire [7:0] tens = u[7:0] / 10;
  wire [7:0] ones = u[7:0] % 10;
  assign s = {tens[3:0], ones[3:0]};
endmodule
