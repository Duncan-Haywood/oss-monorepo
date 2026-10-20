module tb;
  reg clk, rst; reg [3:0] req; wire [3:0] gnt, gr;
  rr_arb4 dut(.clk(clk), .rst(rst), .req(req), .gnt(gnt));
  rr_arb4_ref golden(.clk(clk), .rst(rst), .req(req), .gnt(gr));
  integer k, fail, total, seen_rst; reg [31:0] lfsr;
  initial begin
    clk = 0; fail = 0; total = 0; seen_rst = 0; lfsr = 32'hBEEF_0042; rst = 1; req = 0;
    for (k = 0; k < 4000; k = k + 1) begin
      lfsr = {lfsr[30:0], lfsr[31] ^ lfsr[21] ^ lfsr[1] ^ lfsr[0]};
      rst = (k == 0) || (lfsr[9:0] == 10'd5);
      req = (k % 100 < 50) ? lfsr[15:12] : (lfsr[15:12] | lfsr[19:16]);
      #1;
      if (seen_rst) begin total = total + 1; if (gnt !== gr) fail = fail + 1; end
      clk = 1; #1 clk = 0;
      if (rst) seen_rst = 1;
    end
    $display("RESULT fail=%0d total=%0d", fail, total); $finish;
  end
endmodule
