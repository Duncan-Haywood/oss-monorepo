module seq_1011(input clk, input rst, input x, output hit);
  reg [2:0] hist;
  assign hit = (hist == 3'b101) && x;
  always @(posedge clk) begin
    if (rst) hist <= 3'b000;
    else hist <= {hist[1:0], x};
  end
endmodule
