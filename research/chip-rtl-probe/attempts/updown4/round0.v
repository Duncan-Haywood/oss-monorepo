module updown4(input clk, input rst, input en, input up, output reg [3:0] q);
  always @(posedge clk) begin
    if (rst) q <= 4'd0;
    else if (en) begin
      if (up) q <= q + 1;
      else q <= q - 1;
    end
  end
endmodule
