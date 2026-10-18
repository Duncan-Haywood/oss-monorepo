module clz16(input [15:0] a, output [4:0] n);
  // smear the leading one downward, count the ones: clz = 16 - popcount(smeared).
  wire [15:0] s1 = a | (a >> 1);
  wire [15:0] s2 = s1 | (s1 >> 2);
  wire [15:0] s3 = s2 | (s2 >> 4);
  wire [15:0] s4 = s3 | (s3 >> 8);
  wire [4:0] ones = s4[0]+s4[1]+s4[2]+s4[3]+s4[4]+s4[5]+s4[6]+s4[7]+s4[8]+s4[9]+s4[10]+s4[11]+s4[12]+s4[13]+s4[14]+s4[15];
  assign n = 5'd16 - ones;
endmodule
