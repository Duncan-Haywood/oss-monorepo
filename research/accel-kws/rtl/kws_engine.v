// Serial-MAC engine for a one-hidden-layer quantised MLP (written for this project).
// One multiply-accumulate per cycle, weights/biases/inputs read combinationally from external
// memories. Cycles per inference = IN*H + H*OUT + 1. The class index is the first maximum logit.
module kws_engine #(
    parameter IN  = 70,
    parameter H   = 32,
    parameter OUT = 11,
    parameter WB  = 4,     // weight bits (signed)
    parameter ACCW = 24,
    parameter S1  = 4      // right shift after layer 1
) (
    input  wire clk,
    input  wire rst,
    input  wire start,
    output reg  done,
    // memories (combinational read)
    output wire [$clog2(IN)-1:0]   x_addr,
    input  wire signed [7:0]       x_data,
    output wire [$clog2(IN*H)-1:0] w1_addr,
    input  wire signed [WB-1:0]    w1_data,
    output wire [$clog2(H)-1:0]    b1_addr,
    input  wire signed [ACCW-1:0]  b1_data,
    output wire [$clog2(H*OUT)-1:0] w2_addr,
    input  wire signed [WB-1:0]    w2_data,
    output wire [$clog2(OUT)-1:0]  b2_addr,
    input  wire signed [ACCW-1:0]  b2_data,
    // results
    output reg  [3:0] class_o,
    output reg  lg_valid,
    output reg  [3:0] lg_idx,
    output reg  signed [ACCW-1:0] lg_val
);
    localparam IDLE = 2'd0, L1 = 2'd1, L2 = 2'd2, FIN = 2'd3;
    reg [1:0] state;
    reg [$clog2(IN)-1:0]    i;
    reg [$clog2(H)-1:0]     j;      // layer-1 neuron / layer-2 input index
    reg [$clog2(OUT)-1:0]   k;      // layer-2 neuron
    reg [$clog2(IN*H)-1:0]  wa1;
    reg [$clog2(H*OUT)-1:0] wa2;
    reg signed [ACCW-1:0]   acc;
    reg [7:0] hbuf [0:H-1];
    reg signed [ACCW-1:0] best;

    assign x_addr  = i;
    assign w1_addr = wa1;
    assign b1_addr = j;
    assign w2_addr = wa2;
    assign b2_addr = k;

    wire [7:0] hcur = hbuf[j];
    wire signed [ACCW-1:0] prod1 = x_data * w1_data;
    wire signed [ACCW-1:0] prod2 = $signed({1'b0, hcur}) * w2_data;
    wire signed [ACCW-1:0] sum1 = ((i == 0) ? b1_data : acc) + prod1;
    wire signed [ACCW-1:0] sum2 = ((j == 0) ? b2_data : acc) + prod2;
    wire signed [ACCW-1:0] shifted = sum1 >>> S1;
    wire [7:0] relu8 = (shifted < 0) ? 8'd0 : (shifted > 255) ? 8'd255 : shifted[7:0];

    always @(posedge clk) begin
        done <= 1'b0;
        lg_valid <= 1'b0;
        if (rst) begin
            state <= IDLE;
            i <= 0; j <= 0; k <= 0; wa1 <= 0; wa2 <= 0; acc <= 0; best <= 0; class_o <= 0;
        end else case (state)
            IDLE: if (start) begin
                state <= L1; i <= 0; j <= 0; k <= 0; wa1 <= 0; wa2 <= 0;
            end
            L1: begin
                acc <= sum1;
                wa1 <= wa1 + 1'b1;
                if (i == IN - 1) begin
                    i <= 0;
                    hbuf[j] <= relu8;
                    if (j == H - 1) begin state <= L2; j <= 0; end
                    else j <= j + 1'b1;
                end else i <= i + 1'b1;
            end
            L2: begin
                acc <= sum2;
                wa2 <= wa2 + 1'b1;
                if (j == H - 1) begin
                    j <= 0;
                    lg_valid <= 1'b1; lg_idx <= k; lg_val <= sum2;
                    if (k == 0 || sum2 > best) begin best <= sum2; class_o <= k; end
                    if (k == OUT - 1) state <= FIN;
                    else k <= k + 1'b1;
                end else j <= j + 1'b1;
            end
            FIN: begin done <= 1'b1; state <= IDLE; end
        endcase
    end
endmodule
