module pop16(input [15:0] a, output [4:0] c);
  // 3:2 compressors per weight column (Wallace-style), final column weights 1,2,4,8,16.
  // weight-1 column: 16 bits -> compress with full adders
  wire s00, c00, s01, c01, s02, c02, s03, c03, s04, c04;
  assign {c00, s00} = a[0] + a[1] + a[2];
  assign {c01, s01} = a[3] + a[4] + a[5];
  assign {c02, s02} = a[6] + a[7] + a[8];
  assign {c03, s03} = a[9] + a[10] + a[11];
  assign {c04, s04} = a[12] + a[13] + a[14];
  wire s10, c10, s11, c11;
  assign {c10, s10} = s00 + s01 + s02;
  assign {c11, s11} = s03 + s04 + a[15];
  wire s20, c20;
  assign {c20, s20} = s10 + s11 + 1'b0;
  assign c[0] = s20;
  // weight-2 column: c00..c04, c10, c11, c20  (8 bits)
  wire [3:0] w2 = c00 + c01 + c02 + c03 + c04 + c10 + c11 + c20;
  assign c[1] = w2[0];
  wire [3:0] w4 = w2[3:1];
  assign c[4:2] = w4;
endmodule
