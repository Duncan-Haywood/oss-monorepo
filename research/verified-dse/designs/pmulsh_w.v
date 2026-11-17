// Milestone 125 blind design: a W-bit left shifter whose SW-bit amount is the low SW bits of a narrow product, s = (a * b) mod 2^SW
// with an NA-bit a and an SW-bit b, as in a stride times an index. NA is a dial for gate depth (each extra bit of a adds a
// partial-product row to the array).
module pmulsh_w #(parameter W = 128, parameter SW = 7, parameter NA = 2)
    (input [W-1:0] x, input [NA-1:0] a, input [SW-1:0] b, output [W-1:0] y);
  wire [NA+SW-1:0] p = a * b;
  wire [SW-1:0] s = p[SW-1:0];
  assign y = (x << s);
endmodule
