module bcd_add2(input [7:0] a, input [7:0] b, input cin, output [7:0] s, output cout);
  wire [4:0] lo = a[3:0] + b[3:0] + cin;
  wire lo_c = lo > 9;
  wire [3:0] d0 = lo_c ? lo[3:0] + 4'd6 : lo[3:0];
  wire [4:0] hi = a[7:4] + b[7:4] + lo_c;
  wire hi_c = hi > 9;
  wire [3:0] d1 = hi_c ? hi[3:0] + 4'd6 : hi[3:0];
  assign s = {d1, d0};
  assign cout = hi_c;
endmodule
