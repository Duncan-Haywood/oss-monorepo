// Milestone 125 blind design: a W-bit right shifter whose SW-bit amount is a modular sum, s = (a + b) mod M by one conditional
// subtract (s = a + b >= M ? a + b - M : a + b, kept to SW bits), as in a rotating ring-buffer offset or a modular lane index.
// The adder, the compare against the constant M and the subtract sit in series. M is a constant; SW is a dial for gate depth.
module modsh_w #(parameter W = 128, parameter SW = 7, parameter M = 100)
    (input [W-1:0] x, input [SW-1:0] a, input [SW-1:0] b, output [W-1:0] y);
  wire [SW:0] t = {1'b0, a} + {1'b0, b};
  wire [SW:0] u = t - M;
  wire [SW-1:0] s = (t >= M) ? u[SW-1:0] : t[SW-1:0];
  assign y = x >> s;
endmodule
