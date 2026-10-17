// attempt 0: explicit ripple-carry chain (smallest in theory, slowest).
module add16(input [15:0] a, input [15:0] b, output [16:0] s);
  wire [16:0] c;
  assign c[0] = 1'b0;
  genvar i;
  generate for (i = 0; i < 16; i = i + 1) begin : g
    assign s[i] = a[i] ^ b[i] ^ c[i];
    assign c[i+1] = (a[i] & b[i]) | (c[i] & (a[i] ^ b[i]));
  end endgenerate
  assign s[16] = c[16];
endmodule
