// 8-bit ALU: add, subtract, and, xor selected by op.
module alu8(input [7:0] a, input [7:0] b, input [1:0] op, output reg [8:0] y);
  always @* case (op)
    2'd0: y = a + b;
    2'd1: y = a - b;
    2'd2: y = {1'b0, a & b};
    default: y = {1'b0, a ^ b};
  endcase
endmodule
