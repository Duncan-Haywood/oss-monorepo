// Milestone 138 confirmatory design: a W-bit shifter (left if R = 0, logical right if R = 1) whose SW-bit amount is the low SW bits of
// the quotient floor(a / b) of an NA-bit a by an NB-bit b, by restoring division (b = 0 gives an all-ones quotient), as in scaling a
// lane by a ratio. One compare-and-subtract round per quotient bit, so NA is a dial for gate depth.
module divsh_w #(parameter W = 128, parameter SW = 7, parameter NA = 8, parameter NB = 4, parameter R = 0)
    (input [W-1:0] x, input [NA-1:0] a, input [NB-1:0] b, output [W-1:0] y);
  wire [NB:0] rem [0:NA];
  wire [NA-1:0] q;
  assign rem[0] = 0;
  genvar i;
  generate for (i = 0; i < NA; i = i + 1) begin : rd
    wire [NB+1:0] t = {rem[i], a[NA-1-i]};
    wire ge = t >= {1'b0, b};
    wire [NB+1:0] d = t - {1'b0, b};
    assign q[NA-1-i] = ge;
    assign rem[i+1] = ge ? d[NB:0] : t[NB:0];
  end endgenerate
  wire [SW-1:0] s = q;
  assign y = R ? (x >> s) : (x << s);
endmodule
