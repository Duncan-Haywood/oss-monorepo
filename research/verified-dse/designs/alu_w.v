// Parameterised ALU: add, sub, and, or, xor, set-less-than, shift left/right by one.
module alu_w #(parameter W = 8) (input [W-1:0] a, b, input [2:0] op, output reg [W-1:0] y, output zero);
  always @* case (op)
    3'd0: y = a + b;
    3'd1: y = a - b;
    3'd2: y = a & b;
    3'd3: y = a | b;
    3'd4: y = a ^ b;
    3'd5: y = {{(W-1){1'b0}}, a < b};
    3'd6: y = a << 1;
    default: y = a >> 1;
  endcase
  assign zero = (y == {W{1'b0}});
endmodule
