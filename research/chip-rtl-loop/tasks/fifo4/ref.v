module fifo4_ref(input clk, input rst, input push, input pop, input [7:0] din,
                 output [7:0] dout, output full, output empty);
  reg [7:0] m0, m1, m2, m3;
  reg [1:0] rd, wr; reg [2:0] cnt;
  assign empty = cnt == 0;
  assign full = cnt == 4;
  assign dout = empty ? 8'd0 : (rd == 0 ? m0 : rd == 1 ? m1 : rd == 2 ? m2 : m3);
  wire do_push = push && !full, do_pop = pop && !empty;
  always @(posedge clk) begin
    if (rst) begin rd <= 0; wr <= 0; cnt <= 0; end
    else begin
      if (do_push) begin
        case (wr) 0: m0 <= din; 1: m1 <= din; 2: m2 <= din; default: m3 <= din; endcase
        wr <= wr + 1;
      end
      if (do_pop) rd <= rd + 1;
      cnt <= cnt + do_push - do_pop;
    end
  end
endmodule
