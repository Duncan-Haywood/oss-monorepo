// Milestone 137 confirmatory design: a W-bit left shifter whose SW-bit amount is the integer square root of an NA-bit value,
// s = floor(sqrt(a)), as in shifting by a radius or an RMS level computed in the same cycle. Written as the restoring digit-by-digit
// method (one trial subtraction per result bit, NA/2 rounds), so NA is a dial for gate depth. NA <= 2 SW.
module isqrtsh_w #(parameter W = 128, parameter SW = 7, parameter NA = 12)
    (input [W-1:0] x, input [NA-1:0] a, output [W-1:0] y);
  localparam H = NA / 2;
  wire [NA+1:0] rem [0:H];
  wire [H-1:0] root [0:H];
  assign rem[0] = 0;
  assign root[0] = 0;
  genvar i;
  generate for (i = 0; i < H; i = i + 1) begin : dig
    wire [NA+1:0] cur = (rem[i] << 2) | a[NA-1-2*i -: 2];
    wire [NA+1:0] trial = (root[i] << 2) | 1;
    wire ge = cur >= trial;
    assign rem[i+1] = ge ? cur - trial : cur;
    assign root[i+1] = (root[i] << 1) | ge;
  end endgenerate
  wire [SW-1:0] s = root[H];
  assign y = x << s;
endmodule
