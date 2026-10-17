module tb;
  reg [7:0] a, b; reg cin; wire [7:0] s, sr; wire c, cr;
  bcd_add2 dut(.a(a), .b(b), .cin(cin), .s(s), .cout(c));
  bcd_add2_ref golden(.a(a), .b(b), .cin(cin), .s(sr), .cout(cr));
  integer i, j, ci, fail, total;
  reg [7:0] ti, tj, oi, oj;
  initial begin
    fail = 0; total = 0;
    for (i = 0; i < 100; i = i + 1) for (j = 0; j < 100; j = j + 1) for (ci = 0; ci < 2; ci = ci + 1) begin
      ti = i / 10; oi = i % 10; tj = j / 10; oj = j % 10;
      a = {ti[3:0], oi[3:0]}; b = {tj[3:0], oj[3:0]}; cin = ci[0]; #1;
      total = total + 1;
      if ({c, s} !== {cr, sr}) fail = fail + 1;
    end
    $display("RESULT fail=%0d total=%0d", fail, total); $finish;
  end
endmodule
