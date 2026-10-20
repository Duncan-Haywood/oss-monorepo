module pop16(input [15:0] a, output [4:0] c);
  wire [3:0] lo = a[0]+a[1]+a[2]+a[3]+a[4]+a[5]+a[6]+a[7];
  wire [3:0] hi = a[8]+a[9]+a[10]+a[11]+a[12]+a[13]+a[14]+a[15];
  assign c = lo + hi;
endmodule
