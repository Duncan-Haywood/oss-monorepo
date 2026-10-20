`timescale 1ns/1ps
module tb_gated;
    parameter O = 16, I = 20, B = 4, P = 4, WB = 4, ACCW = 24, MODE = 0, N = 2;
    reg clk = 0, rst = 1, start = 0;
    wire done, out_valid;
    wire [31:0] row_base, col, bidx, out_base, out_b;
    wire [P*ACCW-1:0] out_vec;
    reg signed [7:0] xmem [0:N*B*I-1];
    reg signed [WB-1:0] wmem [0:O*I-1];
    integer base = 0, n, cycles, j, r;
    wire signed [7:0] x_data = xmem[base + bidx*I + col];
    reg [P*WB-1:0] w_data;
    always @* for (j = 0; j < P; j = j + 1) begin
        r = row_base + j;
        w_data[j*WB +: WB] = (r < O) ? wmem[r*I + col] : 7;   // garbage past O: the engine must mask it
    end
    reg signed [ACCW-1:0] y [0:B*O-1];
    gated_engine #(.O(O), .I(I), .B(B), .P(P), .WB(WB), .ACCW(ACCW), .MODE(MODE)) dut (.clk(clk), .rst(rst), .start(start),
        .done(done), .row_base(row_base), .col(col), .bidx(bidx), .x_data(x_data), .w_data(w_data),
        .out_valid(out_valid), .out_base(out_base), .out_b(out_b), .out_vec(out_vec));
    always #5 clk = ~clk;
    integer q;
    always @(posedge clk) if (out_valid) for (q = 0; q < P; q = q + 1)
        if (out_base + q < O) y[out_b*O + out_base + q] <= $signed(out_vec[q*ACCW +: ACCW]);
    // operand-fetch counters: a weight is fetched when a valid lane's (row, col) differs from what it held the
    // cycle before; an activation when (bidx, col) differs from the bus the cycle before. Count only while running.
    integer wb0; integer wrd, xrd, pw [0:P-1]; integer px;
    always @(posedge clk) if (dut.run) begin
        for (q = 0; q < P; q = q + 1) if (row_base + q < O) begin
            if (pw[q] != (row_base + q)*I + col) wrd = wrd + 1;
            pw[q] = (row_base + q)*I + col;
        end
        if (px != bidx*I + col) xrd = xrd + 1;
        px = bidx*I + col;
    end
    initial begin
        $readmemh("x.hex", xmem); $readmemh("w.hex", wmem);
        repeat (3) @(posedge clk); rst = 0;
        for (n = 0; n < N; n = n + 1) begin
            base = n * B * I; wb0 = dut.wrbits; wrd = 0; xrd = 0; px = -1;
            for (q = 0; q < P; q = q + 1) pw[q] = -1;
            @(posedge clk); start <= 1; @(posedge clk); start <= 0;
            cycles = 1;
            while (!done) begin @(posedge clk); cycles = cycles + 1; end
            @(posedge clk);
            $write("R %0d %0d %0d %0d %0d", n, cycles, wrd, xrd, dut.wrbits - wb0);
            for (q = 0; q < B*O; q = q + 1) $write(" %0d", y[q]);
            $write("\n");
        end
        $finish;
    end
endmodule
