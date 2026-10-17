module tb;
  reg signed [7:0] a,b; wire [8:0] y,yr;
  integer i, bad;
  absdiff8 dut(.a(a),.b(b),.y(y));
  absdiff8_ref rf(.a(a),.b(b),.y(yr));
  initial begin
    bad = 0;
    for (i = 0; i < 4000; i = i + 1) begin
      a=$random; b=$random;
      #1;
      if (y!==yr) begin bad = bad + 1; if (bad <= 3) $display("MISMATCH a=%0d b=%0d dut=%0d ref=%0d", a,b,y,yr); end
    end
    $display("MISMATCHES %0d", bad);
    $finish;
  end
endmodule
