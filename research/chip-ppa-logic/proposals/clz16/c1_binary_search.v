module clz16(input [15:0] a, output [4:0] n);
  wire z8 = ~|a[15:8];
  wire [7:0] x8 = z8 ? a[7:0] : a[15:8];
  wire z4 = ~|x8[7:4];
  wire [3:0] x4 = z4 ? x8[3:0] : x8[7:4];
  wire z2 = ~|x4[3:2];
  wire [1:0] x2 = z2 ? x4[1:0] : x4[3:2];
  wire z1 = ~x2[1];
  wire zero = ~|a;
  assign n = zero ? 5'd16 : {1'b0, z8, z4, z2, z1};
endmodule
