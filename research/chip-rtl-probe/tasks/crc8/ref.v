module crc8_ref(input [7:0] crc_in, input [7:0] data, output reg [7:0] crc_out);
  reg [7:0] x; integer i;
  always @* begin
    x = crc_in ^ data;
    for (i = 0; i < 8; i = i + 1) x = x[7] ? ((x << 1) ^ 8'h07) : (x << 1);
    crc_out = x;
  end
endmodule
