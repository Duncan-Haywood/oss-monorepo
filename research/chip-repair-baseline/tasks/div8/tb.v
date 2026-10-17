module tb;
  reg [7:0] n, d; wire [7:0] q, r, qr, rr;
  div8 dut(.n(n), .d(d), .q(q), .r(r)); div8_ref golden(.n(n), .d(d), .q(qr), .r(rr));
  integer k, fail, total;
  initial begin
    fail = 0; total = 0;
    for (k = 0; k < 65536; k = k + 1) begin
      {d, n} = k[15:0]; #1; total = total + 1;
      if ({q, r} !== {qr, rr}) fail = fail + 1;
    end
    $display("RESULT fail=%0d total=%0d", fail, total); $finish;
  end
endmodule
