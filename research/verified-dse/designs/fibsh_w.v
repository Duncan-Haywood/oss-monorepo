// Milestone 133 blind design: a W-bit left shifter whose SW-bit amount is a multiplicative (Fibonacci) hash of an NA-bit key,
// s = top SW bits of (a * C mod 2^NA), C the odd constant nearest 2^NA / golden ratio, as in shifting by a hashed bucket index.
// The constant multiplier is a dial for gate depth through NA.
module fibsh_w #(parameter W = 128, parameter SW = 7, parameter NA = 10, parameter C = 633)
    (input [W-1:0] x, input [NA-1:0] a, output [W-1:0] y);
  wire [NA-1:0] h = a * C;
  wire [SW-1:0] s = h[NA-1 -: SW];
  assign y = x << s;
endmodule
