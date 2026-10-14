module tb;
  reg [7:0] a, b; wire [7:0] d, dr;
  absdiff8 dut(.a(a), .b(b), .d(d)); absdiff8_ref golden(.a(a), .b(b), .d(dr));
  integer k, fail, total;
  initial begin
    fail = 0; total = 0;
    for (k = 0; k < 65536; k = k + 1) begin
      {b, a} = k[15:0]; #1;
      total = total + 1;
      if (d !== dr) fail = fail + 1;
    end
    $display("RESULT fail=%0d total=%0d", fail, total);
    $finish;
  end
endmodule
