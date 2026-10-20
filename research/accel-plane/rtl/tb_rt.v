`timescale 1ns/1ps
module tb_rt;
    parameter O = 64, I = 70, P = 4, WB = 4, ACCW = 24, N = 3, PIPE = 0;
    reg clk = 0, rst = 1, start = 0;
    wire done, out_valid;
    wire [31:0] row, col_base, out_row;
    wire signed [ACCW-1:0] out_val;
    reg signed [7:0] xmem [0:N*I-1];
    reg signed [WB-1:0] wmem [0:O*I-1];
    integer base = 0, n, cycles, j, c;
    reg [P*8-1:0] x_data;
    reg [P*WB-1:0] w_data;
    always @* for (j = 0; j < P; j = j + 1) begin
        c = col_base + j;
        x_data[j*8 +: 8]   = (c < I) ? xmem[base + c] : 100;     // garbage past I: the engine must mask it
        w_data[j*WB +: WB] = (c < I) ? wmem[row*I + c] : 7;
    end
    reg signed [ACCW-1:0] y [0:O-1];
    rt_engine #(.O(O), .I(I), .P(P), .WB(WB), .ACCW(ACCW), .PIPE(PIPE)) dut (.clk(clk), .rst(rst), .start(start),
        .done(done), .row(row), .col_base(col_base), .x_data(x_data), .w_data(w_data),
        .out_valid(out_valid), .out_row(out_row), .out_val(out_val));
    always #5 clk = ~clk;
    integer q;
    always @(posedge clk) if (out_valid) y[out_row] <= out_val;
    initial begin
        $readmemh("x.hex", xmem); $readmemh("w.hex", wmem);
        repeat (3) @(posedge clk); rst = 0;
        for (n = 0; n < N; n = n + 1) begin
            base = n * I;
            @(posedge clk); start <= 1; @(posedge clk); start <= 0;
            cycles = 1;
            while (!done) begin @(posedge clk); cycles = cycles + 1; end
            @(posedge clk);
            $write("R %0d %0d", n, cycles);
            for (q = 0; q < O; q = q + 1) $write(" %0d", y[q]);
            $write("\n");
        end
        $finish;
    end
endmodule
