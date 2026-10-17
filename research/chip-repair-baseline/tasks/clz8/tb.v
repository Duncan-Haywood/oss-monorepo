module tb;
  reg [7:0] x; wire [3:0] n, nr;
  clz8 dut(.x(x), .n(n)); clz8_ref golden(.x(x), .n(nr));
  integer k, fail, total;
  initial begin
    fail = 0; total = 0;
    for (k = 0; k < 256; k = k + 1) begin
      {x} = k[7:0]; #1;
      total = total + 1;
      if (n !== nr) fail = fail + 1;
    end
    $display("RESULT fail=%0d total=%0d", fail, total);
    $finish;
  end
endmodule
