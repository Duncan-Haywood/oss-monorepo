// P-lane batched matrix-product engine (written for this project): y[b][o] = sum_i W[o][i] * x[b][i].
// WS=0 (output-stationary, schedule t,b,i): one set of P accumulators; weights are re-fetched for every batch element.
// WS=1 (weight-stationary,  schedule t,i,b): the weight bus holds still for B cycles; costs B sets of P accumulators.
// Lane j owns output t*P+j; lanes past O in the last tile are masked (the memory is not trusted to return zero there).
module batch_engine #(
    parameter O = 16, parameter I = 20, parameter B = 4, parameter P = 4, parameter WB = 4, parameter ACCW = 24,
    parameter WS = 0,
    parameter OBW = $clog2(O + P) + 1
) (
    input  wire clk, input wire rst, input wire start,
    output reg  done,
    output wire [31:0] row_base, output wire [31:0] col, output wire [31:0] bidx,
    input  wire signed [7:0]      x_data,   // x[bidx][col]
    input  wire [P*WB-1:0]        w_data,   // lane j: W[row_base+j][col]
    output reg  out_valid,
    output reg  [OBW-1:0] out_base,
    output reg  [31:0] out_b,
    output reg  [P*ACCW-1:0] out_vec
);
    localparam NT = (O + P - 1) / P;
    localparam TW = $clog2(NT) + 1, IW = $clog2(I) + 1, BW = $clog2(B) + 1;
    localparam NS = WS ? B : 1;                       // accumulator sets
    reg run;
    reg [TW-1:0] t; reg [IW-1:0] i; reg [BW-1:0] b;
    reg signed [ACCW-1:0] acc [0:NS*P-1];
    assign row_base = t * P;
    assign col = i;
    assign bidx = b;
    integer j;
    reg signed [ACCW-1:0] nxt [0:P-1];
    reg signed [WB-1:0] wj;
    reg signed [ACCW-1:0] prod;
    wire [BW-1:0] slot = WS ? b : 0;
    wire first = (i == 0), last = (i == I - 1);
    always @* begin
        for (j = 0; j < P; j = j + 1) begin
            wj = w_data[j*WB +: WB];
            prod = x_data * wj;
            nxt[j] = (first ? $signed({ACCW{1'b0}}) : acc[slot*P + j]) +
                     ((row_base + j < O) ? prod : $signed({ACCW{1'b0}}));
        end
    end
    always @(posedge clk) begin
        done <= 1'b0; out_valid <= 1'b0;
        if (rst) begin run <= 0; t <= 0; i <= 0; b <= 0; end
        else if (!run) begin
            if (start) begin run <= 1; t <= 0; i <= 0; b <= 0; end
        end else begin
            for (j = 0; j < P; j = j + 1) acc[slot*P + j] <= nxt[j];
            if (last) begin
                out_valid <= 1'b1; out_base <= t * P; out_b <= b;
                for (j = 0; j < P; j = j + 1) out_vec[j*ACCW +: ACCW] <= nxt[j];
            end
            if (WS == 0) begin                      // t, b, i
                if (last) begin
                    i <= 0;
                    if (b == B - 1) begin
                        b <= 0;
                        if (t == NT - 1) begin run <= 0; done <= 1'b1; end else t <= t + 1;
                    end else b <= b + 1;
                end else i <= i + 1;
            end else begin                          // t, i, b
                if (b == B - 1) begin
                    b <= 0;
                    if (last) begin
                        i <= 0;
                        if (t == NT - 1) begin run <= 0; done <= 1'b1; end else t <= t + 1;
                    end else i <= i + 1;
                end else b <= b + 1;
            end
        end
    end
endmodule
