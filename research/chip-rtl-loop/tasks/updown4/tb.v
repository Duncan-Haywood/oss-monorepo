module tb;
  reg clk=0, rst=1; reg en=0, up=0; wire [3:0] q, qr;
  integer i, bad;
  updown4 dut(.clk(clk),.rst(rst),.en(en),.up(up),.q(q));
  updown4_ref rf(.clk(clk),.rst(rst),.en(en),.up(up),.q(qr));
  always #5 clk = ~clk;
  initial begin
    bad = 0; 
    repeat (2) @(posedge clk);
    #1 rst = 0;
    for (i = 0; i < 4000; i = i + 1) begin
      @(negedge clk);
      rst = ($random % 40) == 0; en=$random; up=$random;
      @(posedge clk); #1;
      if (q!==qr) begin bad = bad + 1; if (bad <= 3) $display("MISMATCH cycle %0d dut=%0d ref=%0d", i, q,qr); end
    end
    $display("MISMATCHES %0d", bad);
    $finish;
  end
endmodule
