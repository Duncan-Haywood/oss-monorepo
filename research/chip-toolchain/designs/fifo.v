// Synchronous FIFO, DEPTH a power of two, with full/empty flags.
module fifo #(parameter W = 8, parameter AW = 2) (
    input             clk, rst,
    input             push, pop,
    input  [W-1:0]    din,
    output [W-1:0]    dout,
    output            full, empty
);
    reg [W-1:0] mem [0:(1<<AW)-1];
    reg [AW:0]  wp, rp;
    assign empty = (wp == rp);
    assign full  = (wp[AW-1:0] == rp[AW-1:0]) && (wp[AW] != rp[AW]);
    assign dout  = mem[rp[AW-1:0]];
    always @(posedge clk) begin
        if (rst) begin wp <= 0; rp <= 0; end
        else begin
            if (push && !full) begin mem[wp[AW-1:0]] <= din; wp <= wp + 1; end
            if (pop && !empty) rp <= rp + 1;
        end
    end
endmodule
