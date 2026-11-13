// Milestone 121 blind design: a left shifter whose amount is the population count of a W-bit mask (as in compacting the set
// lanes of a vector). The amount comes from a W-input counter written as a chain of additions, so it is driven by deep logic,
// like the leading-zero normaliser's priority encoder but from a different family. A count of W shifts everything out.
module pcsh_w #(parameter W = 64, parameter CW = 7) (input [W-1:0] x, input [W-1:0] m, output [W-1:0] y);
  integer i;
  reg [CW-1:0] c;
  always @* begin
    c = 0;
    for (i = 0; i < W; i = i + 1) c = c + m[i];
  end
  assign y = x << c;
endmodule
