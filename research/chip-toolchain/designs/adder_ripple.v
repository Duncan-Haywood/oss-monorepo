// Ripple-carry adder built from full adders (structural).
module adder_ripple #(parameter W = 8) (
    input  [W-1:0] a, b,
    output [W:0]   s
);
    wire [W:0] c;
    assign c[0] = 1'b0;
    genvar i;
    generate
        for (i = 0; i < W; i = i + 1) begin : fa
            assign s[i]   = a[i] ^ b[i] ^ c[i];
            assign c[i+1] = (a[i] & b[i]) | (c[i] & (a[i] ^ b[i]));
        end
    endgenerate
    assign s[W] = c[W];
endmodule
