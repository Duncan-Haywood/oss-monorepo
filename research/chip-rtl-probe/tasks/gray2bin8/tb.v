module tb;
  reg [7:0] g; wire [7:0] b,br;
  integer i, bad;
  gray2bin8 dut(.g(g),.b(b));
  gray2bin8_ref rf(.g(g),.b(br));
  initial begin
    bad = 0;
    for (i = 0; i < 4000; i = i + 1) begin
      g=$random;
      #1;
      if (b!==br) begin bad = bad + 1; if (bad <= 3) $display("MISMATCH g=%b dut=%b ref=%b", g,b,br); end
    end
    $display("MISMATCHES %0d", bad);
    $finish;
  end
endmodule
