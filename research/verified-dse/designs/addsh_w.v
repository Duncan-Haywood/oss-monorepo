// Milestone 121 blind design: a right barrel shifter whose amount is the (wrapping) sum of two inputs, as in an address-offset or
// base-plus-index shift. The amount comes from one small adder, so it is driven by shallow logic rather than straight from a pin.
module addsh_w #(parameter W = 64, parameter SW = 6) (input [W-1:0] x, input [SW-1:0] a, input [SW-1:0] b, output [W-1:0] y);
  wire [SW-1:0] s = a + b;
  assign y = x >> s;
endmodule
