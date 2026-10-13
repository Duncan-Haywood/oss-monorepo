module tb;
  reg [7:0] req; wire [2:0] idx, ir; wire v, vr;
  prio_enc8 dut(.req(req), .idx(idx), .valid(v)); prio_enc8_ref golden(.req(req), .idx(ir), .valid(vr));
  integer k, fail, total;
  initial begin
    fail = 0; total = 0;
    for (k = 0; k < 256; k = k + 1) begin
      {req} = k[7:0]; #1;
      total = total + 1;
      if ({idx, v} !== {ir, vr}) fail = fail + 1;
    end
    $display("RESULT fail=%0d total=%0d", fail, total);
    $finish;
  end
endmodule
