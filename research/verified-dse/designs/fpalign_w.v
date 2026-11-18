// Milestone 121 blind design: a floating-point adder's alignment step. The mantissa x is shifted right by the absolute exponent
// difference |ea - eb| (8-bit exponents; a difference of W or more shifts everything out). The amount comes from a subtract,
// a compare and a select, so it is driven by a few levels of word-level logic.
module fpalign_w #(parameter W = 64, parameter EW = 8) (input [W-1:0] x, input [EW-1:0] ea, input [EW-1:0] eb, output [W-1:0] y);
  wire [EW-1:0] d = (ea >= eb) ? ea - eb : eb - ea;
  assign y = x >> d;
endmodule
