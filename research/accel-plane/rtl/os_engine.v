// P-lane output-stationary matrix-vector engine (written for this project): y[o] = sum_i W[o][i] * x[i].
// Lane j owns output t*P+j for tile t; one input element is broadcast per cycle; partial sums stay in lane
// registers. Lanes past O in the last tile are masked (the memory is not trusted to return zero there).
// Schedule: for t in tiles: for i in 0..I-1. Cycles = ceil(O/P)*I plus fixed overhead.
module os_engine #(
    parameter O = 64, parameter I = 70, parameter P = 4, parameter WB = 4, parameter ACCW = 24,
    parameter OBW = $clog2(O + P) + 1           // width of out_base (derived)
) (
    input  wire clk, input wire rst, input wire start,
    output reg  done,
    output wire [31:0] row_base,            // output index of lane 0 this cycle
    output wire [31:0] col,                 // input index this cycle
    input  wire signed [7:0]      x_data,   // x[col]
    input  wire [P*WB-1:0]        w_data,   // lane j: W[row_base+j][col]
    output reg  out_valid,
    output reg  [OBW-1:0] out_base,
    output reg  [P*ACCW-1:0] out_vec
);
    localparam NT = (O + P - 1) / P;
    reg run;
    localparam TW = $clog2(NT) + 1, IW = $clog2(I) + 1;     // counters sized to their range
    reg [TW-1:0] t;
    reg [IW-1:0] i;
    reg signed [ACCW-1:0] acc [0:P-1];
    assign row_base = t * P;                // zero-extended to the 32-bit port
    assign col = i;
    integer j;
    reg signed [ACCW-1:0] nxt [0:P-1];
    reg signed [WB-1:0] wj;
    reg signed [ACCW-1:0] prod;
    always @* begin
        for (j = 0; j < P; j = j + 1) begin
            wj = w_data[j*WB +: WB];
            prod = x_data * wj;                // assigned to an ACCW-bit signed reg: full-width product
            nxt[j] = ((i == 0) ? $signed({ACCW{1'b0}}) : acc[j]) +
                     ((row_base + j < O) ? prod : $signed({ACCW{1'b0}}));
        end
    end
    always @(posedge clk) begin
        done <= 1'b0; out_valid <= 1'b0;
        if (rst) begin run <= 0; t <= 0; i <= 0; end
        else if (!run) begin
            if (start) begin run <= 1; t <= 0; i <= 0; end
        end else begin
            for (j = 0; j < P; j = j + 1) acc[j] <= nxt[j];
            if (i == I - 1) begin
                out_valid <= 1'b1; out_base <= t * P;
                for (j = 0; j < P; j = j + 1) out_vec[j*ACCW +: ACCW] <= nxt[j];
                i <= 0;
                if (t == NT - 1) begin run <= 0; done <= 1'b1; end
                else t <= t + 1;
            end else i <= i + 1;
        end
    end
endmodule
