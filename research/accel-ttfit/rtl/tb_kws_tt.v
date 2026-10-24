// Replays stream.hex (one 16-bit word per clock: {uio_in, ui_in}) and prints "D <cycle> <class>" at each done.
module tb_kws_tt;
    parameter IN = 70, H = 16, OUT = 11, WB = 4, ACCW = 20, S1 = 4, NCYC = 1000;
    reg clk = 0, rst_n = 0;
    reg [7:0] ui_in = 0, uio_in = 0;
    wire [7:0] uo_out;
    reg [15:0] mem [0:NCYC-1];
    integer t;
    kws_tt #(.IN(IN), .H(H), .OUT(OUT), .WB(WB), .ACCW(ACCW), .S1(S1)) dut (.clk(clk), .rst_n(rst_n), .ui_in(ui_in), .uio_in(uio_in), .uo_out(uo_out));
    always #5 clk = ~clk;
    initial begin
        $readmemh("stream.hex", mem);
        repeat (3) @(posedge clk);
        #1 rst_n = 1;
        for (t = 0; t < NCYC; t = t + 1) begin
            ui_in = mem[t][7:0]; uio_in = mem[t][15:8];
            @(posedge clk);
            #1 if (uo_out[4]) $display("D %0d %0d", t, uo_out[3:0]);
        end
        $finish;
    end
endmodule
