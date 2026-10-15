// attempt 4: Sklansky-style divide-and-conquer prefix adder (log depth, fewer cells than Kogge-Stone, high fanout).
module add16(input [15:0] a, input [15:0] b, output [16:0] s);
  wire [15:0] p = a ^ b, g0 = a & b;
  // Sklansky prefix: level k combines each group with the top of the previous group.
  wire [15:0] G1, P1, G2, P2, G3, P3, G4, P4;
  genvar i;
  generate for (i = 0; i < 16; i = i + 1) begin : s1
    if (i % 2 == 1) begin assign G1[i] = g0[i] | (p[i] & g0[i-1]); assign P1[i] = p[i] & p[i-1]; end
    else begin assign G1[i] = g0[i]; assign P1[i] = p[i]; end
  end endgenerate
  generate for (i = 0; i < 16; i = i + 1) begin : s2
    if (i % 4 >= 2) begin assign G2[i] = G1[i] | (P1[i] & G1[i - i%4 + 1]); assign P2[i] = P1[i] & P1[i - i%4 + 1]; end
    else begin assign G2[i] = G1[i]; assign P2[i] = P1[i]; end
  end endgenerate
  generate for (i = 0; i < 16; i = i + 1) begin : s3
    if (i % 8 >= 4) begin assign G3[i] = G2[i] | (P2[i] & G2[i - i%8 + 3]); assign P3[i] = P2[i] & P2[i - i%8 + 3]; end
    else begin assign G3[i] = G2[i]; assign P3[i] = P2[i]; end
  end endgenerate
  generate for (i = 0; i < 16; i = i + 1) begin : s4
    if (i >= 8) begin assign G4[i] = G3[i] | (P3[i] & G3[7]); assign P4[i] = P3[i] & P3[7]; end
    else begin assign G4[i] = G3[i]; assign P4[i] = P3[i]; end
  end endgenerate
  assign s[0] = p[0];
  generate for (i = 1; i < 16; i = i + 1) begin : sm
    assign s[i] = p[i] ^ G4[i-1];
  end endgenerate
  assign s[16] = G4[15];
endmodule
