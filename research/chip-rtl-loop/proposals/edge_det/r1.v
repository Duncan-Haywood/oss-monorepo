module edge_det(input clk, input rst, input x, output reg pulse);
  // feedback: pulse must be a flop output, one cycle after the edge is sampled
  reg prev;
  always @(posedge clk) begin
    if (rst) begin
      prev <= 1'b0;
      pulse <= 1'b0;
    end else begin
      prev <= x;
      pulse <= x & ~prev;
    end
  end
endmodule
