// Parallel CRC-32 (IEEE 802.3 polynomial 0x04C11DB7), W data bits folded into a 32-bit state in one step (XOR tree).
module crc32_w #(parameter W = 32) (input [31:0] c, input [W-1:0] d, output reg [31:0] n);
  integer i;
  reg [31:0] s;
  always @* begin
    s = c;
    for (i = W - 1; i >= 0; i = i - 1)
      s = (s[31] ^ d[i]) ? ((s << 1) ^ 32'h04C11DB7) : (s << 1);
    n = s;
  end
endmodule
