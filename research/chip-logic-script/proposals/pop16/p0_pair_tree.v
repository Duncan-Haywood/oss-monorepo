module pop16(input [15:0] a, output [4:0] c);
  wire [1:0] s1 [0:7]; wire [2:0] s2 [0:3]; wire [3:0] s3 [0:1];
  genvar i;
  generate
    for (i = 0; i < 8; i = i + 1) begin : l1 assign s1[i] = a[2*i] + a[2*i+1]; end
    for (i = 0; i < 4; i = i + 1) begin : l2 assign s2[i] = s1[2*i] + s1[2*i+1]; end
    for (i = 0; i < 2; i = i + 1) begin : l3 assign s3[i] = s2[2*i] + s2[2*i+1]; end
  endgenerate
  assign c = s3[0] + s3[1];
endmodule
