// Four broadcast controls (fanout 64 each) gate four permuted 64-bit words that are summed (high-fanout nets feeding a carry-save/carry-propagate adder tree, so ABC pass sequences give many distinct mappings).
module bcastadd (input [63:0] a, input [63:0] b, input [3:0] k, output [66:0] y);
  wire [63:0] p0 = k[0] ? a : 64'd0;
  wire [63:0] p1 = k[1] ? {b[31:0], b[63:32]} : 64'd0;
  wire [63:0] p2 = k[2] ? ~a : 64'd0;
  wire [63:0] p3 = k[3] ? {a[7:0], b[63:8]} : 64'd0;
  assign y = p0 + p1 + p2 + p3;
endmodule
