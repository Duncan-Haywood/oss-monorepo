// Milestone 132 blind design: a W-bit left shifter whose 7-bit amount comes from R rounds of a fixed 7-bit substitution table
// keyed by R round keys, s = a, then s = LUT[s ^ k(i)] (an SPN-style lane hash, as in a scrambled or hashed shift select). LUT
// is a fixed permutation of 0..127 drawn with Python's random.Random(132).shuffle, packed 7 bits per entry (entry i at bits
// 7i to 7i + 6). It is read with an indexed part-select of a constant rather than a case statement, so that Yosys keeps it as
// logic (a case statement of constants becomes a ROM cell, which the amount gate-depth probe cannot see through). SW must be 7.
module lutsh_w #(parameter W = 128, parameter SW = 7, parameter R = 1)
    (input [W-1:0] x, input [SW-1:0] a, input [SW*R-1:0] k, output [W-1:0] y);
  localparam [895:0] LUT = 896'hd24da07e457d854e3f663cbaa2833ee5099cdbbd5492cf7d8d189fcf89823af612d575111bc4d5b0c5dafd4eba441388557a746bacf93e285860248945eca6c2f089e63d214053e44f164edc0635d807d46fa8d2acd7822ba96fff83cfbdc184af0229acb4c56380b6a0bad8ada6ce37;
  wire [SW-1:0] s [0:R];
  assign s[0] = a;
  genvar i;
  generate for (i = 0; i < R; i = i + 1) begin : rnd
    wire [SW-1:0] v = s[i] ^ k[i*SW +: SW];
    assign s[i+1] = LUT[v*7 +: 7];
  end endgenerate
  assign y = x << s[R];
endmodule
