// Unsigned squarer written with the * operator (a family no earlier table ran: half the partial products of a W-bit multiplier
// coincide, so the synthesised array differs from mult_op's).
module sq_op #(parameter W = 16) (input [W-1:0] a, output [2*W-1:0] p);
  assign p = a * a;
endmodule
