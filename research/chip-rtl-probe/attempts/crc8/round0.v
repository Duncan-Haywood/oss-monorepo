module crc8(input [7:0] crc_in, input [7:0] data, output [7:0] crc_out);
  wire [7:0] x0 = crc_in ^ data;
  wire [7:0] x1 = x0[7] ? ((x0 << 1) ^ 8'h07) : (x0 << 1);
  wire [7:0] x2 = x1[7] ? ((x1 << 1) ^ 8'h07) : (x1 << 1);
  wire [7:0] x3 = x2[7] ? ((x2 << 1) ^ 8'h07) : (x2 << 1);
  wire [7:0] x4 = x3[7] ? ((x3 << 1) ^ 8'h07) : (x3 << 1);
  wire [7:0] x5 = x4[7] ? ((x4 << 1) ^ 8'h07) : (x4 << 1);
  wire [7:0] x6 = x5[7] ? ((x5 << 1) ^ 8'h07) : (x5 << 1);
  wire [7:0] x7 = x6[7] ? ((x6 << 1) ^ 8'h07) : (x6 << 1);
  wire [7:0] x8 = x7[7] ? ((x7 << 1) ^ 8'h07) : (x7 << 1);
  assign crc_out = x8;
endmodule
