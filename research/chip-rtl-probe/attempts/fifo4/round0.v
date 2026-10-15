module fifo4(input clk, input rst, input push, input pop, input [7:0] din,
             output [7:0] dout, output full, output empty);
  reg [7:0] mem [0:3];
  reg [1:0] rd, wr;
  reg [2:0] cnt;
  assign empty = (cnt == 0);
  assign full  = (cnt == 4);
  assign dout  = empty ? 8'd0 : mem[rd];
  always @(posedge clk) begin
    if (rst) begin
      rd <= 0; wr <= 0; cnt <= 0;
    end else begin
      if (push && !full) begin
        mem[wr] <= din;
        wr <= wr + 1;
      end
      if (pop && !empty) rd <= rd + 1;
      if (push && !full && !(pop && !empty)) cnt <= cnt + 1;
      else if (pop && !empty && !(push && !full)) cnt <= cnt - 1;
    end
  end
endmodule
