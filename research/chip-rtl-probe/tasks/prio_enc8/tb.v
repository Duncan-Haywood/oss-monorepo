module tb;
  reg [7:0] req; wire [2:0] idx,idxr; wire v,vr;
  integer i, bad;
  prio_enc8 dut(.req(req),.idx(idx),.valid(v));
  prio_enc8_ref rf(.req(req),.idx(idxr),.valid(vr));
  initial begin
    bad = 0;
    for (i = 0; i < 4000; i = i + 1) begin
      req=$random; if (i%5==0) req = 8'd1 << (i%8); if (i%97==0) req = 0;
      #1;
      if (idx!==idxr || v!==vr) begin bad = bad + 1; if (bad <= 3) $display("MISMATCH req=%b dut=%0d/%b ref=%0d/%b", req,idx,v,idxr,vr); end
    end
    $display("MISMATCHES %0d", bad);
    $finish;
  end
endmodule
