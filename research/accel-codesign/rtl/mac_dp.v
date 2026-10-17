// P-lane MAC datapath: P signed (8 x WB) multipliers, an adder tree, one accumulator register.
// Written for this project; used ONLY to measure how datapath area grows with lane count P.
module mac_dp #(parameter P = 1, parameter WB = 4, parameter ACCW = 24) (
    input  wire clk,
    input  wire clr,
    input  wire signed [8*P-1:0]  x,
    input  wire signed [WB*P-1:0] w,
    output reg  signed [ACCW-1:0] acc
);
    integer i;
    reg signed [ACCW-1:0] s;
    always @* begin
        s = 0;
        for (i = 0; i < P; i = i + 1)
            s = s + $signed(x[8*i +: 8]) * $signed(w[WB*i +: WB]);
    end
    always @(posedge clk) acc <= (clr ? {ACCW{1'b0}} : acc) + s;
endmodule
