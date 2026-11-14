// Milestone 123 blind design: a W-bit left shifter whose SW-bit amount is the top SW bits of a chain of K fixed-point
// multiplies over OW-bit operands, s = a, then K rounds of s = high OW bits of (s * b[i]) (a scale-and-normalise step, as in
// computing a shift from a product of gains). Each round is one word-level $mul cell, so the amount's word-level depth is K,
// while OW sets how many gate levels each multiply adds.
module mulsh_w #(parameter W = 128, parameter SW = 7, parameter OW = 12, parameter K = 2)
    (input [W-1:0] x, input [OW-1:0] a, input [OW*K-1:0] b, output [W-1:0] y);
  integer i;
  reg [OW-1:0] s;
  reg [2*OW-1:0] p;
  always @* begin
    s = a;
    for (i = 0; i < K; i = i + 1) begin
      p = s * b[i*OW +: OW];
      s = p[2*OW-1 -: OW];
    end
  end
  assign y = x << s[OW-1 -: SW];
endmodule
