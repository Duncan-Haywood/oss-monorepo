// Unsigned multiplier written with the * operator.
module mult_op #(parameter W = 4) (
    input  [W-1:0]   a, b,
    output [2*W-1:0] p
);
    assign p = a * b;
endmodule
