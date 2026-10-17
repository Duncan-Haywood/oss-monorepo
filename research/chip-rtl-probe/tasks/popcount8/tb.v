module tb;
  reg [7:0] a; wire [3:0] y,yr;
  integer i, bad;
  popcount8 dut(.a(a),.y(y));
  popcount8_ref rf(.a(a),.y(yr));
  initial begin
    bad = 0;
    for (i = 0; i < 4000; i = i + 1) begin
      a=$random;
      #1;
      if (y!==yr) begin bad = bad + 1; if (bad <= 3) $display("MISMATCH a=%b dut=%0d ref=%0d", a,y,yr); end
    end
    $display("MISMATCHES %0d", bad);
    $finish;
  end
endmodule
