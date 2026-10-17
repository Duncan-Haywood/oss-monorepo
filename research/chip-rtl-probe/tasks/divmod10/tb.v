module tb;
  reg [7:0] n; wire [7:0] q, qr; wire [3:0] r, rr; integer i, bad;
  divmod10 dut(.n(n), .q(q), .r(r));
  divmod10_ref rf(.n(n), .q(qr), .r(rr));
  initial begin
    bad = 0;
    for (i = 0; i < 4000; i = i + 1) begin
      n = $random; #1;
      if (q !== qr || r !== rr) begin bad = bad + 1; if (bad <= 3) $display("MISMATCH n=%0d dut=%0d,%0d ref=%0d,%0d", n, q, r, qr, rr); end
    end
    $display("MISMATCHES %0d", bad); $finish;
  end
endmodule
