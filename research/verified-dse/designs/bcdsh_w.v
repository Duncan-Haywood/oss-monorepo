// Milestone 133 blind design: a W-bit left shifter whose SW-bit amount is a D-digit BCD number converted to binary (modulo 2^SW),
// s = d(D-1) * 10^(D-1) + ... + d0, as in shifting by a position typed on a decimal keypad or read from a BCD counter. D is a
// dial for gate depth.
module bcdsh_w #(parameter W = 128, parameter SW = 7, parameter D = 2)
    (input [W-1:0] x, input [4*D-1:0] d, output [W-1:0] y);
  wire [SW-1:0] acc [0:D];
  assign acc[D] = 0;
  genvar i;
  generate for (i = D - 1; i >= 0; i = i - 1) begin : dig
    assign acc[i] = acc[i+1] * 4'd10 + d[4*i +: 4];
  end endgenerate
  assign y = x << acc[0];
endmodule
