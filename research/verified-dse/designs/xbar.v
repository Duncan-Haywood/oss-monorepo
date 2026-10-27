// 16-port, 8-bit crossbar: every output picks any input by its own 4-bit select (high fanout, wire-dominated).
module xbar (input [127:0] din, input [63:0] sel, output [127:0] dout);
  genvar i;
  generate for (i = 0; i < 16; i = i + 1) begin : g
    assign dout[8*i +: 8] = din[8*sel[4*i +: 4] +: 8];
  end endgenerate
endmodule
