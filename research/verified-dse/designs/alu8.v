// 8-bit ALU: add, sub, and, or, xor, set-less-than, shift left/right by one.
module alu8(input [7:0] a, b, input [2:0] op, output reg [7:0] y, output zero);
  always @* case (op)
    3'd0: y = a + b;
    3'd1: y = a - b;
    3'd2: y = a & b;
    3'd3: y = a | b;
    3'd4: y = a ^ b;
    3'd5: y = {7'b0, a < b};
    3'd6: y = a << 1;
    default: y = a >> 1;
  endcase
  assign zero = (y == 8'b0);
endmodule
