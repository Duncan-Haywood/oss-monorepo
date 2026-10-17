// Pushes 0..5 into a depth-4 FIFO then pops; prints "tag value full empty".
module tb_fifo;
    reg clk = 0, rst = 1, push = 0, pop = 0;
    reg [7:0] din = 0;
    wire [7:0] dout; wire full, empty;
    fifo #(.W(8), .AW(2)) u (.clk(clk), .rst(rst), .push(push), .pop(pop),
                             .din(din), .dout(dout), .full(full), .empty(empty));
    always #5 clk = ~clk;
    integer k;
    initial begin
        @(posedge clk); #1 rst = 0;
        for (k = 0; k < 6; k = k + 1) begin
            push = 1; din = 10 + k; @(posedge clk); #1;
            $display("push %0d %0d %0d", din, full, empty);
        end
        push = 0;
        for (k = 0; k < 5; k = k + 1) begin
            $display("pop %0d %0d %0d", dout, full, empty);
            pop = 1; @(posedge clk); #1; pop = 0;
        end
        $finish;
    end
endmodule
