module tb;
  reg clk=0, rst=1; reg d=0; wire p, pr;
  integer i, bad;
  edge_det dut(.clk(clk),.rst(rst),.d(d),.pulse(p));
  edge_det_ref rf(.clk(clk),.rst(rst),.d(d),.pulse(pr));
  always #5 clk = ~clk;
  initial begin
    bad = 0; 
    repeat (2) @(posedge clk);
    #1 rst = 0;
    for (i = 0; i < 4000; i = i + 1) begin
      @(negedge clk);
      rst = ($random % 40) == 0; d=$random;
      @(posedge clk); #1;
      if (p!==pr) begin bad = bad + 1; if (bad <= 3) $display("MISMATCH cycle %0d dut=%b ref=%b", i, p,pr); end
    end
    $display("MISMATCHES %0d", bad);
    $finish;
  end
endmodule
