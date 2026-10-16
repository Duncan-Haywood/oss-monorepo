// P-lane reduction-tree matrix-vector engine (written for this project): y[o] = sum_i W[o][i] * x[i].
// Lane j takes input it*P+j of the current output; a balanced adder tree sums the P products; one accumulator
// carries the output across input tiles. PIPE=1 puts a register after the tree. Lanes past I in the last
// input tile are masked. Schedule: for o: for it in input tiles. Cycles = O*ceil(I/P) plus overhead.
module rt_engine #(
    parameter O = 64, parameter I = 70, parameter P = 4, parameter WB = 4, parameter ACCW = 24,
    parameter PIPE = 0,
    parameter OW = $clog2(O) + 1                // width of the output index (derived)
) (
    input  wire clk, input wire rst, input wire start,
    output reg  done,
    output wire [31:0] row,                 // output index this cycle
    output wire [31:0] col_base,            // input index of lane 0 this cycle
    input  wire [P*8-1:0]  x_data,          // lane j: x[col_base+j]
    input  wire [P*WB-1:0] w_data,          // lane j: W[row][col_base+j]
    output reg  out_valid,
    output reg  [OW-1:0] out_row,
    output reg  signed [ACCW-1:0] out_val
);
    localparam NIT = (I + P - 1) / P;
    localparam NP = (P <= 1) ? 1 : (1 << $clog2(P));
    reg run;
    localparam TW = $clog2(NIT) + 1;      // counters sized to their range
    reg [OW-1:0] o;
    reg [TW-1:0] it;
    assign row = o;
    assign col_base = it * P;
    // heap-ordered tree: leaves at NP-1+j, node k sums 2k+1 and 2k+2
    wire signed [ACCW-1:0] node [0:2*NP-2];
    genvar g;
    generate
        for (g = 0; g < NP; g = g + 1) begin : leaf
            if (g < P) begin : real_lane
                wire signed [7:0]    xj = x_data[g*8 +: 8];
                wire signed [WB-1:0] wj = w_data[g*WB +: WB];
                wire signed [ACCW-1:0] prod = xj * wj;   // full-width product
                assign node[NP-1+g] = (col_base + g < I) ? prod : $signed({ACCW{1'b0}});
            end else begin : pad
                assign node[NP-1+g] = {ACCW{1'b0}};
            end
        end
        for (g = 0; g < NP - 1; g = g + 1) begin : inner
            assign node[g] = node[2*g+1] + node[2*g+2];
        end
    endgenerate
    wire signed [ACCW-1:0] tree = node[0];
    wire first0 = (it == 0), last0 = (it == NIT - 1);
    reg signed [ACCW-1:0] s_sum; reg s_v, s_first, s_last; reg [OW-1:0] s_o;
    wire signed [ACCW-1:0] a_sum   = PIPE ? s_sum : tree;
    wire a_v     = PIPE ? s_v : run;
    wire a_first = PIPE ? s_first : first0;
    wire a_last  = PIPE ? s_last : last0;
    wire [OW-1:0] a_o = PIPE ? s_o : o;
    reg signed [ACCW-1:0] acc;
    wire signed [ACCW-1:0] total = (a_first ? $signed({ACCW{1'b0}}) : acc) + a_sum;
    reg fin;                                 // last output has been issued
    always @(posedge clk) begin
        done <= 1'b0; out_valid <= 1'b0;
        if (rst) begin run <= 0; o <= 0; it <= 0; s_v <= 0; fin <= 0; end
        else begin
            s_sum <= tree; s_v <= run; s_first <= first0; s_last <= last0; s_o <= o;
            if (!run && !fin) begin
                if (start) begin run <= 1; o <= 0; it <= 0; end
            end
            if (run) begin
                if (last0) begin
                    it <= 0;
                    if (o == O - 1) begin run <= 0; fin <= 1; end else o <= o + 1;
                end else it <= it + 1;
            end
            if (a_v) begin
                acc <= total;
                if (a_last) begin
                    out_valid <= 1'b1; out_row <= a_o; out_val <= total;
                    if (a_o == O - 1) done <= 1'b1;
                end
            end
            if (done) fin <= 0;
        end
    end
endmodule
