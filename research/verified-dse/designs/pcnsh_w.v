// Milestone 122 blind design: a W-bit left shifter whose amount is the population count of a narrow M-bit mask (M much less than
// W), as in advancing a stream buffer by the number of valid bytes in a short group. The amount comes from an M-input counter
// written as a chain of additions, so its word-level depth is about M: the same mechanism as pcsh_w (milestone 121, depth W - 1),
// scaled down into the 4-to-32 range that milestone 121 left untested. CW = clog2(M + 1).
module pcnsh_w #(parameter W = 128, parameter M = 8, parameter CW = 4) (input [W-1:0] x, input [M-1:0] m, output [W-1:0] y);
  integer i;
  reg [CW-1:0] c;
  always @* begin
    c = 0;
    for (i = 0; i < M; i = i + 1) c = c + m[i];
  end
  assign y = x << c;
endmodule
