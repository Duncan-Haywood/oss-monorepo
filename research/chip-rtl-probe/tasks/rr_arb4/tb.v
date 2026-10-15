module tb;
  reg clk = 0, rst = 1; reg [3:0] req = 0; wire [3:0] g, gr; integer i, bad;
  rr_arb4 dut(.clk(clk), .rst(rst), .req(req), .grant(g));
  rr_arb4_ref rf(.clk(clk), .rst(rst), .req(req), .grant(gr));
  always #5 clk = ~clk;
  initial begin
    bad = 0;
    repeat (2) @(posedge clk);
    #1 rst = 0;
    for (i = 0; i < 4000; i = i + 1) begin
      @(negedge clk);
      rst = ($random % 40) == 0; req = $random; #1;
      if (g !== gr) begin bad = bad + 1; if (bad <= 3) $display("MISMATCH cycle %0d req=%b dut=%b ref=%b", i, req, g, gr); end
    end
    $display("MISMATCHES %0d", bad); $finish;
  end
endmodule
