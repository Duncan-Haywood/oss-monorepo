// Rotate-and-mask unit (a family no earlier table ran): x rotated left by s, then ANDed with the contiguous mask of bits mb..me
// (bit 0 = LSB; empty when mb > me). The rotate-then-mask instruction of CPU datapaths (rlwinm-style bit-field extract/insert).
module rotmask_w #(parameter W = 64, parameter SW = 6) (input [W-1:0] x, input [SW-1:0] s, input [SW-1:0] mb, input [SW-1:0] me,
                                                       output [W-1:0] y);
  wire [2*W-1:0] d = {x, x} << s;
  wire [W-1:0] r = d[2*W-1:W];
  genvar i;
  wire [W-1:0] m;
  generate for (i = 0; i < W; i = i + 1) begin : g
    assign m[i] = (i >= mb) && (i <= me);
  end endgenerate
  assign y = r & m;
endmodule
