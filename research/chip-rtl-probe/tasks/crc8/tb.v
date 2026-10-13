module tb;
  reg [7:0] c, d; wire [7:0] y, yr; integer i, bad;
  crc8 dut(.crc_in(c), .data(d), .crc_out(y));
  crc8_ref rf(.crc_in(c), .data(d), .crc_out(yr));
  initial begin
    bad = 0;
    for (i = 0; i < 4000; i = i + 1) begin
      c = $random; d = $random; #1;
      if (y !== yr) begin bad = bad + 1; if (bad <= 3) $display("MISMATCH crc=%h data=%h dut=%h ref=%h", c, d, y, yr); end
    end
    $display("MISMATCHES %0d", bad); $finish;
  end
endmodule
