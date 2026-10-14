module tb;
  reg [7:0] a; reg [2:0] n; wire [7:0] y,yr;
  integer i, bad;
  rotl8 dut(.a(a),.n(n),.y(y));
  rotl8_ref rf(.a(a),.n(n),.y(yr));
  initial begin
    bad = 0;
    for (i = 0; i < 4000; i = i + 1) begin
      a=$random; n=$random;
      #1;
      if (y!==yr) begin bad = bad + 1; if (bad <= 3) $display("MISMATCH a=%b n=%0d dut=%b ref=%b", a,n,y,yr); end
    end
    $display("MISMATCHES %0d", bad);
    $finish;
  end
endmodule
