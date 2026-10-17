// Testbench: runs N input vectors through kws_engine and prints class, cycles and logits.
`timescale 1ns/1ps
module tb_kws;
    parameter IN = 70, H = 32, OUT = 11, WB = 4, ACCW = 24, S1 = 4, N = 8;
    reg clk = 0, rst = 1, start = 0;
    wire done, lg_valid;
    wire [3:0] class_o, lg_idx;
    wire signed [ACCW-1:0] lg_val;
    wire [$clog2(IN)-1:0] x_addr;
    wire [$clog2(IN*H)-1:0] w1_addr;
    wire [$clog2(H)-1:0] b1_addr;
    wire [$clog2(H*OUT)-1:0] w2_addr;
    wire [$clog2(OUT)-1:0] b2_addr;
    reg signed [7:0] xmem [0:N*IN-1];
    reg signed [WB-1:0] w1mem [0:IN*H-1];
    reg signed [ACCW-1:0] b1mem [0:H-1];
    reg signed [WB-1:0] w2mem [0:H*OUT-1];
    reg signed [ACCW-1:0] b2mem [0:OUT-1];
    integer base = 0, n, cycles;
    wire signed [7:0] x_data = xmem[base + x_addr];
    wire signed [WB-1:0] w1_data = w1mem[w1_addr];
    wire signed [ACCW-1:0] b1_data = b1mem[b1_addr];
    wire signed [WB-1:0] w2_data = w2mem[w2_addr];
    wire signed [ACCW-1:0] b2_data = b2mem[b2_addr];
    reg signed [ACCW-1:0] lg [0:OUT-1];
    kws_engine #(.IN(IN), .H(H), .OUT(OUT), .WB(WB), .ACCW(ACCW), .S1(S1)) dut (
        .clk(clk), .rst(rst), .start(start), .done(done),
        .x_addr(x_addr), .x_data(x_data), .w1_addr(w1_addr), .w1_data(w1_data),
        .b1_addr(b1_addr), .b1_data(b1_data), .w2_addr(w2_addr), .w2_data(w2_data),
        .b2_addr(b2_addr), .b2_data(b2_data),
        .class_o(class_o), .lg_valid(lg_valid), .lg_idx(lg_idx), .lg_val(lg_val));
    always #5 clk = ~clk;
    always @(posedge clk) if (lg_valid) lg[lg_idx] <= lg_val;
    integer q;
    initial begin
        $readmemh("x.hex", xmem);
        $readmemh("w1.hex", w1mem);
        $readmemh("b1.hex", b1mem);
        $readmemh("w2.hex", w2mem);
        $readmemh("b2.hex", b2mem);
        repeat (3) @(posedge clk);
        rst = 0;
        for (n = 0; n < N; n = n + 1) begin
            base = n * IN;
            @(posedge clk); start <= 1;
            @(posedge clk); start <= 0;
            cycles = 1;
            while (!done) begin @(posedge clk); cycles = cycles + 1; end
            @(posedge clk);
            $write("R %0d %0d %0d", n, class_o, cycles);
            for (q = 0; q < OUT; q = q + 1) $write(" %0d", lg[q]);
            $write("\n");
        end
        $finish;
    end
endmodule
