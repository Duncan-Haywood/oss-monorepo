`timescale 1ns/1ps
module tb_os;
    parameter O = 64, I = 70, P = 4, WB = 4, ACCW = 24, N = 3;
    reg clk = 0, rst = 1, start = 0;
    wire done, out_valid;
    wire [31:0] row_base, col, out_base;
    wire [P*ACCW-1:0] out_vec;
    reg signed [7:0] xmem [0:N*I-1];
    reg signed [WB-1:0] wmem [0:O*I-1];
    integer base = 0, n, cycles, j, r;
    wire signed [7:0] x_data = xmem[base + col];
    reg [P*WB-1:0] w_data;
    always @* for (j = 0; j < P; j = j + 1) begin
        r = row_base + j;
        w_data[j*WB +: WB] = (r < O) ? wmem[r*I + col] : 7;   // garbage past O: the engine must mask it
    end
    reg signed [ACCW-1:0] y [0:O-1];
    os_engine #(.O(O), .I(I), .P(P), .WB(WB), .ACCW(ACCW)) dut (.clk(clk), .rst(rst), .start(start), .done(done),
        .row_base(row_base), .col(col), .x_data(x_data), .w_data(w_data),
        .out_valid(out_valid), .out_base(out_base), .out_vec(out_vec));
    always #5 clk = ~clk;
    integer q;
    always @(posedge clk) if (out_valid) for (q = 0; q < P; q = q + 1)
        if (out_base + q < O) y[out_base + q] <= $signed(out_vec[q*ACCW +: ACCW]);
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
