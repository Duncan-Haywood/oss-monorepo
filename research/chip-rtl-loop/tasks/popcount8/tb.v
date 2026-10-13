module tb;
  reg [7:0] x; wire [3:0] y, yr;
  popcount8 dut(.x(x), .y(y)); popcount8_ref golden(.x(x), .y(yr));
  integer k, fail, total;
  initial begin
    fail = 0; total = 0;
    for (k = 0; k < 256; k = k + 1) begin
      {x} = k[7:0]; #1;
      total = total + 1;
      if (y !== yr) fail = fail + 1;
    end
    $display("RESULT fail=%0d total=%0d", fail, total);
    $finish;
  end
endmodule
