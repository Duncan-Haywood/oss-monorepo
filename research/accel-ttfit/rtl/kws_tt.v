// Streaming keyword-spotting engine sized for a Tiny Tapeout tile (written for this project).
// No weight memory and no address pins: the host streams one operand pair per clock, in a fixed order.
//   ui_in[7:0]   x byte (layer 1), or a bias byte
//   uio_in[WB-1:0] weight (signed)
//   uio_in[7]    start (one-cycle pulse while idle; ui_in/uio_in then carry the first operand)
//   uo_out[3:0]  class of the last finished inference, uo_out[4] done (one cycle)
// Per neuron: two bias bytes (low, high; signed 16-bit), then N MACs. Layer 1: H neurons x (2+IN) cycles;
// layer 2: OUT neurons x (2+H) cycles (the hidden vector is a rotating shift register, no read mux).
// Cycles per inference = H*(2+IN) + OUT*(2+H) + 1. Argmax is the first maximum, as in accel-kws.
module kws_tt #(
    parameter IN = 70, parameter H = 16, parameter OUT = 11,
    parameter WB = 4, parameter ACCW = 20, parameter S1 = 4
) (
    input  wire clk,
    input  wire rst_n,
    input  wire [7:0] ui_in,
    input  wire [7:0] uio_in,
    output wire [7:0] uo_out
);
    localparam IDLE = 2'd0, L1 = 2'd1, L2 = 2'd2, FIN = 2'd3;
    localparam NMAX = (IN > H) ? IN : H;
    reg [1:0] state;
    reg [$clog2(NMAX+2)-1:0] c;       // position inside a neuron: 0,1 bias bytes, then MACs
    reg [$clog2(H > OUT ? H : OUT)-1:0] n;   // neuron index
    reg signed [ACCW-1:0] acc, best;
    reg [7:0] hbuf [0:H-1];
    reg [3:0] cls;
    reg done;
    wire rst = ~rst_n;
    wire start = uio_in[7];
    wire signed [WB-1:0] w = uio_in[WB-1:0];
    wire l1 = (state == L1);
    wire signed [ACCW-1:0] prod = l1 ? ($signed(ui_in) * w) : ($signed({1'b0, hbuf[0]}) * w);
    wire signed [ACCW-1:0] sum = acc + prod;
    wire signed [ACCW-1:0] shifted = sum >>> S1;
    wire [7:0] relu8 = (shifted < 0) ? 8'd0 : (shifted > 255) ? 8'd255 : shifted[7:0];
    wire last = (c == (l1 ? IN + 1 : H + 1));
    integer q;
    assign uo_out = {3'b0, done, cls};

    always @(posedge clk) begin
        done <= 1'b0;
        if (rst) begin
            state <= IDLE; c <= 0; n <= 0; acc <= 0; best <= 0; cls <= 0;
        end else case (state)
            IDLE: if (start) begin state <= L1; c <= 1; n <= 0; acc[7:0] <= ui_in; end
            L1, L2: begin
                if (c == 0) begin acc[7:0] <= ui_in; c <= c + 1'b1; end
                else if (c == 1) begin acc <= $signed({ui_in, acc[7:0]}); c <= c + 1'b1; end
                else begin
                    acc <= sum;
                    if (!l1) begin
                        hbuf[H-1] <= hbuf[0];
                        for (q = 0; q < H-1; q = q + 1) hbuf[q] <= hbuf[q+1];
                    end
                    if (last) begin
                        c <= 0;
                        if (l1) begin
                            hbuf[H-1] <= relu8;
                            for (q = 0; q < H-1; q = q + 1) hbuf[q] <= hbuf[q+1];
                            if (n == H - 1) begin state <= L2; n <= 0; end else n <= n + 1'b1;
                        end else begin
                            if (n == 0 || sum > best) begin best <= sum; cls <= n; end
                            if (n == OUT - 1) state <= FIN; else n <= n + 1'b1;
                        end
                    end else c <= c + 1'b1;
                end
            end
            FIN: begin done <= 1'b1; state <= IDLE; end
        endcase
    end
endmodule
