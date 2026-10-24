// CRC-16/CCITT (poly 0x1021) update over one byte, combinational.
module crc16(input [15:0] c, input [7:0] d, output [15:0] n);
  integer i;
  reg [15:0] r;
  always @* begin
    r = c ^ {d, 8'b0};
    for (i = 0; i < 8; i = i + 1) r = r[15] ? ((r << 1) ^ 16'h1021) : (r << 1);
  end
  assign n = r;
endmodule
