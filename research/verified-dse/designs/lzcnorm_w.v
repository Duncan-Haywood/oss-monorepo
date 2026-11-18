// Leading-zero count and normalising shift (a family no earlier table ran): z = number of leading zeros of x (W when x = 0), and
// y = x << z, the mantissa normaliser of floating-point adders. LW = clog2(W + 1).
module lzcnorm_w #(parameter W = 32, parameter LW = 6) (input [W-1:0] x, output reg [LW-1:0] z, output [W-1:0] y);
  integer i;
  reg found;
  always @* begin
    z = W;
    found = 0;
    for (i = W - 1; i >= 0; i = i - 1)
      if (!found && x[i]) begin z = W - 1 - i; found = 1; end
  end
  assign y = x << z;
endmodule
