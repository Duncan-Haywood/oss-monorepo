module tb;
  reg clk, rst, en, dec;
  wire [3:0] q, qr;
  satcnt4 dut(.clk(clk), .rst(rst), .en(en), .dec(dec), .q(q));
  satcnt4_ref golden(.clk(clk), .rst(rst), .en(en), .dec(dec), .q(qr));
  integer k, fail, total, seen_rst;
  reg [31:0] lfsr;
  initial begin
    clk = 0; fail = 0; total = 0; lfsr = 32'hACE1_1234; seen_rst = 0;
    rst = 1; en = 0; dec = 0;
    for (k = 0; k < 4000; k = k + 1) begin
      // phases: long up-runs and long down-runs so both saturation points are reached
      lfsr = {lfsr[30:0], lfsr[31] ^ lfsr[21] ^ lfsr[1] ^ lfsr[0]};
      rst = (k == 0) || (lfsr[7:0] == 8'd3);
      en  = (lfsr[10:8] != 3'd0);
      dec = ((k / 40) % 2) ? (lfsr[12:11] != 2'd0) : (lfsr[12:11] == 2'd0);
      #1 clk = 1; #1 clk = 0;
      if (rst) seen_rst = 1;
      #1; total = total + 1;
      if (seen_rst && q !== qr) fail = fail + 1;
    end
    $display("RESULT fail=%0d total=%0d", fail, total);
    $finish;
  end
endmodule
