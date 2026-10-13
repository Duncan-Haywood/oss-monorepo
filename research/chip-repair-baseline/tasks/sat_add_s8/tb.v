module tb;
  reg [7:0] a, b; wire [7:0] s, sr;
  sat_add_s8 dut(.a(a), .b(b), .s(s)); sat_add_s8_ref golden(.a(a), .b(b), .s(sr));
  integer k, fail, total;
  initial begin
    fail = 0; total = 0;
    for (k = 0; k < 65536; k = k + 1) begin
      {b, a} = k[15:0]; #1; total = total + 1;
      if (s !== sr) fail = fail + 1;
    end
    $display("RESULT fail=%0d total=%0d", fail, total); $finish;
  end
endmodule
