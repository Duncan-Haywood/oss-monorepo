module tb;
  reg [7:0] g; wire [7:0] b, br;
  gray2bin8 dut(.g(g), .b(b)); gray2bin8_ref golden(.g(g), .b(br));
  integer k, fail, total;
  initial begin
    fail = 0; total = 0;
    for (k = 0; k < 256; k = k + 1) begin
      {g} = k[7:0]; #1;
      total = total + 1;
      if (b !== br) fail = fail + 1;
    end
    $display("RESULT fail=%0d total=%0d", fail, total);
    $finish;
  end
endmodule
