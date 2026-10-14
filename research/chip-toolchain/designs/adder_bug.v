// Negative control: ripple adder with the carry out of bit 2 dropped.
module adder_bug #(parameter W = 8) (
    input  [W-1:0] a, b,
    output [W:0]   s
);
    wire [W:0] c;
    assign c[0] = 1'b0;
    genvar i;
    generate
        for (i = 0; i < W; i = i + 1) begin : fa
            assign s[i]   = a[i] ^ b[i] ^ c[i];
            if (i == 2) assign c[i+1] = 1'b0;
            else        assign c[i+1] = (a[i] & b[i]) | (c[i] & (a[i] ^ b[i]));
        end
    endgenerate
    assign s[W] = c[W];
endmodule
