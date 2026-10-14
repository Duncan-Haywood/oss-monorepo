module edge_det(input clk, input rst, input x, output pulse);
  reg prev;
  assign pulse = x & ~prev;
  always @(posedge clk) begin
    if (rst) prev <= 1'b0;
    else prev <= x;
  end
endmodule
