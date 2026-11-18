// Parameterised crossbar: P output ports, each picks any of P B-bit inputs by its own SB-bit select (P = 2**SB).
// Milestone 113 generalises designs/xbar.v (P = 16, B = 8) so that unseen port counts and widths can be run.
module xbar_w #(parameter P = 16, parameter B = 8, parameter SB = 4) (input [P*B-1:0] din, input [P*SB-1:0] sel, output [P*B-1:0] dout);
  genvar i;
  generate for (i = 0; i < P; i = i + 1) begin : g
    assign dout[B*i +: B] = din[B*sel[SB*i +: SB] +: B];
  end endgenerate
endmodule
