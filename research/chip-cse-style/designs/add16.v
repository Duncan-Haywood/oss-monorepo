// Reference: 16-bit unsigned adder with carry out. The only thing a rewrite must preserve is this function.
module add16(input [15:0] a, input [15:0] b, output [16:0] s);
  assign s = a + b;
endmodule
