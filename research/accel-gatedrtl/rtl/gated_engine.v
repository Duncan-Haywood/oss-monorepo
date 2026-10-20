// P-lane batched matrix-product engine (written for this project; same datapath, schedule and ports as
// accel-planebatch's batch_engine): y[b][o] = sum_i W[o][i] * x[b][i].
// MODE 0: output-stationary, one set of P accumulators.                      (planebatch WS=0)
// MODE 1: weight-stationary, B sets of P accumulators, ungated (write enable) (planebatch WS=1)
// MODE 2: weight-stationary, B*P clock gates: one per 24-bit accumulator (G = ACCW flops per gate).
// MODE 3: weight-stationary, B clock gates: one per set of P accumulators (G = P*ACCW flops per gate).
// A gated accumulator is a plain flop on its gate's clock; the gate opens in the cycles the set is written.
module gated_engine #(
    parameter O = 16, parameter I = 20, parameter B = 4, parameter P = 4, parameter WB = 4, parameter ACCW = 24,
    parameter MODE = 0,
    parameter OBW = $clog2(O + P) + 1
) (
    input  wire clk, input wire rst, input wire start,
    output reg  done,
    output wire [31:0] row_base, output wire [31:0] col, output wire [31:0] bidx,
    input  wire signed [7:0]      x_data,
    input  wire [P*WB-1:0]        w_data,
    output reg  out_valid,
    output reg  [OBW-1:0] out_base,
    output reg  [31:0] out_b,
    output reg  [P*ACCW-1:0] out_vec
);
    localparam WS = (MODE != 0);
    localparam NT = (O + P - 1) / P;
    localparam TW = $clog2(NT) + 1, IW = $clog2(I) + 1, BW = $clog2(B) + 1;
    localparam NS = WS ? B : 1;
    reg run;
`ifndef SYNTH
    integer wrbits = 0;   // simulation only: accumulator bits written, counted at the flops' own clock edges
`endif
    reg [TW-1:0] t; reg [IW-1:0] i; reg [BW-1:0] b;
    assign row_base = t * P;
    assign col = i;
    assign bidx = b;
    integer j;
    reg signed [ACCW-1:0] nxt [0:P-1];
    reg signed [WB-1:0] wj;
    reg signed [ACCW-1:0] prod;
    wire [BW-1:0] slot = WS ? b : 0;
    wire first = (i == 0), last = (i == I - 1);

    // accumulator storage: accq is the registered value; accd the next-state bus
    wire [NS*P*ACCW-1:0] accq;
    wire [NS*P*ACCW-1:0] accd;
    genvar s, p;
    generate
        for (s = 0; s < NS; s = s + 1) begin : set
            wire we = run && (slot == s);
            if (MODE == 3) begin : g3
                wire gclk; icg g (.clk(clk), .en(we), .gclk(gclk));
                reg [P*ACCW-1:0] q;
                always @(posedge gclk) q <= accd[s*P*ACCW +: P*ACCW];
`ifndef SYNTH
                always @(posedge gclk) wrbits = wrbits + P*ACCW;
`endif
                assign accq[s*P*ACCW +: P*ACCW] = q;
            end else
            for (p = 0; p < P; p = p + 1) begin : lane
                if (MODE == 2) begin : g2
                    wire gclk; icg g (.clk(clk), .en(we), .gclk(gclk));
                    reg [ACCW-1:0] q;
                    always @(posedge gclk) q <= accd[(s*P+p)*ACCW +: ACCW];
`ifndef SYNTH
                    always @(posedge gclk) wrbits = wrbits + ACCW;
`endif
                    assign accq[(s*P+p)*ACCW +: ACCW] = q;
                end else begin : g01
                    reg [ACCW-1:0] q;
                    always @(posedge clk) if (we) q <= accd[(s*P+p)*ACCW +: ACCW];
                    assign accq[(s*P+p)*ACCW +: ACCW] = q;
                end
            end
        end
    endgenerate
    // the next-state value is nxt[lane] for the slot being written; other sets' accd is don't-care (never clocked)
    generate
        for (s = 0; s < NS; s = s + 1) for (p = 0; p < P; p = p + 1) begin : wire_d
            assign accd[(s*P+p)*ACCW +: ACCW] = nxt[p];
        end
    endgenerate

    always @* begin
        for (j = 0; j < P; j = j + 1) begin
            wj = w_data[j*WB +: WB];
            prod = x_data * wj;
            nxt[j] = (first ? $signed({ACCW{1'b0}}) : $signed(accq[(slot*P + j)*ACCW +: ACCW])) +
                     ((row_base + j < O) ? prod : $signed({ACCW{1'b0}}));
        end
    end
    always @(posedge clk) begin
        done <= 1'b0; out_valid <= 1'b0;
        if (rst) begin run <= 0; t <= 0; i <= 0; b <= 0; end
        else if (!run) begin
            if (start) begin run <= 1; t <= 0; i <= 0; b <= 0; end
        end else begin
            if (last) begin
                out_valid <= 1'b1; out_base <= t * P; out_b <= b;
                for (j = 0; j < P; j = j + 1) out_vec[j*ACCW +: ACCW] <= nxt[j];
            end
            if (WS == 0) begin
                if (last) begin
                    i <= 0;
                    if (b == B - 1) begin
                        b <= 0;
                        if (t == NT - 1) begin run <= 0; done <= 1'b1; end else t <= t + 1;
                    end else b <= b + 1;
                end else i <= i + 1;
            end else begin
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
`ifndef SYNTH
    // simulation only (ungated modes): accumulator bits written = one set per running cycle
    generate if (MODE < 2) begin : cnt01
        always @(posedge clk) if (run) wrbits = wrbits + P*ACCW;
    end endgenerate
`endif
endmodule
