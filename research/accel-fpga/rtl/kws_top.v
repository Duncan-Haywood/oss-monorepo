// FPGA top for accel-kws's kws_engine (written for this project). The engine's external memories
// become constant ROMs loaded from hex files (combinational read, as the engine expects), the
// engine restarts itself, and its result pins are reduced to a few outputs so the design fits any package.
module kws_top #(
    parameter IN = 70, H = 32, OUT = 11, WB = 4, ACCW = 24, S1 = 4
) (
    input  wire clk,
    output wire done,
    output wire [3:0] class_o,
    output wire dbg
);
    reg [3:0] por = 4'd0;
    wire rst = ~por[3];
    always @(posedge clk) if (!por[3]) por <= por + 1'b1;

    wire [$clog2(IN)-1:0]    x_addr;
    wire [$clog2(IN*H)-1:0]  w1_addr;
    wire [$clog2(H)-1:0]     b1_addr;
    wire [$clog2(H*OUT)-1:0] w2_addr;
    wire [$clog2(OUT)-1:0]   b2_addr;
    reg signed [7:0]      xmem  [0:IN-1];
    reg signed [WB-1:0]   w1mem [0:IN*H-1];
    reg signed [ACCW-1:0] b1mem [0:H-1];
    reg signed [WB-1:0]   w2mem [0:H*OUT-1];
    reg signed [ACCW-1:0] b2mem [0:OUT-1];
    initial begin
        $readmemh("x.hex", xmem);
        $readmemh("w1.hex", w1mem);
        $readmemh("b1.hex", b1mem);
        $readmemh("w2.hex", w2mem);
        $readmemh("b2.hex", b2mem);
    end
    wire lg_valid;
    wire [3:0] lg_idx;
    wire signed [ACCW-1:0] lg_val;
    kws_engine #(.IN(IN), .H(H), .OUT(OUT), .WB(WB), .ACCW(ACCW), .S1(S1)) eng (
        .clk(clk), .rst(rst), .start(1'b1), .done(done),
        .x_addr(x_addr), .x_data(xmem[x_addr]),
        .w1_addr(w1_addr), .w1_data(w1mem[w1_addr]),
        .b1_addr(b1_addr), .b1_data(b1mem[b1_addr]),
        .w2_addr(w2_addr), .w2_data(w2mem[w2_addr]),
        .b2_addr(b2_addr), .b2_data(b2mem[b2_addr]),
        .class_o(class_o), .lg_valid(lg_valid), .lg_idx(lg_idx), .lg_val(lg_val));
    assign dbg = lg_valid ^ (^lg_idx) ^ (^lg_val);
endmodule
