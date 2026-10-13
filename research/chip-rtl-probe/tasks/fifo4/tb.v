module tb;
  reg clk = 0, rst = 1, push = 0, pop = 0; reg [7:0] din = 0;
  wire [7:0] dout, doutr; wire full, empty, fullr, emptyr; integer i, bad;
  fifo4 dut(.clk(clk), .rst(rst), .push(push), .pop(pop), .din(din), .dout(dout), .full(full), .empty(empty));
  fifo4_ref rf(.clk(clk), .rst(rst), .push(push), .pop(pop), .din(din), .dout(doutr), .full(fullr), .empty(emptyr));
  always #5 clk = ~clk;
  initial begin
    bad = 0;
    repeat (2) @(posedge clk);
    #1 rst = 0;
    for (i = 0; i < 4000; i = i + 1) begin
      @(negedge clk);
      rst = ($random % 60) == 0; push = $random; pop = $random; din = $random; #1;
      if (dout !== doutr || full !== fullr || empty !== emptyr) begin
        bad = bad + 1; if (bad <= 3) $display("MISMATCH cycle %0d dut=%h/%b/%b ref=%h/%b/%b", i, dout, full, empty, doutr, fullr, emptyr);
      end
    end
    $display("MISMATCHES %0d", bad); $finish;
  end
endmodule
