// attempt 1: Kogge-Stone parallel-prefix adder (log depth, many cells).
module add16(input [15:0] a, input [15:0] b, output [16:0] s);
  wire [15:0] p0 = a ^ b;
  wire [15:0] g1, p1, g2, p2, g3, p3, g4, p4;
  wire [15:0] g0 = a & b;
  genvar i;
  generate for (i = 0; i < 16; i = i + 1) begin : l1
    if (i >= 1) begin assign g1[i] = g0[i] | (p0[i] & g0[i-1]); assign p1[i] = p0[i] & p0[i-1]; end
    else begin assign g1[i] = g0[i]; assign p1[i] = p0[i]; end
  end endgenerate
  generate for (i = 0; i < 16; i = i + 1) begin : l2
    if (i >= 2) begin assign g2[i] = g1[i] | (p1[i] & g1[i-2]); assign p2[i] = p1[i] & p1[i-2]; end
    else begin assign g2[i] = g1[i]; assign p2[i] = p1[i]; end
  end endgenerate
  generate for (i = 0; i < 16; i = i + 1) begin : l3
    if (i >= 4) begin assign g3[i] = g2[i] | (p2[i] & g2[i-4]); assign p3[i] = p2[i] & p2[i-4]; end
    else begin assign g3[i] = g2[i]; assign p3[i] = p2[i]; end
  end endgenerate
  generate for (i = 0; i < 16; i = i + 1) begin : l4
    if (i >= 8) begin assign g4[i] = g3[i] | (p3[i] & g3[i-8]); assign p4[i] = p3[i] & p3[i-8]; end
    else begin assign g4[i] = g3[i]; assign p4[i] = p3[i]; end
  end endgenerate
  assign s[0] = p0[0];
  generate for (i = 1; i < 16; i = i + 1) begin : sm
    assign s[i] = p0[i] ^ g4[i-1];
  end endgenerate
  assign s[16] = g4[15];
endmodule
