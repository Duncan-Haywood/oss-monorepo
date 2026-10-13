// Adder written with the + operator; the synthesis flow chooses the structure.
module adder_op #(parameter W = 8) (
    input  [W-1:0] a, b,
    output [W:0]   s
);
    assign s = a + b;
endmodule
