module satcnt4(input clk, input rst, input en, input dec, output reg [3:0] q);
  always @(posedge clk) begin
    if (rst) q <= 4'd0;
    else if (en) begin
      if (dec && q > 0) q <= q - 1;
      else if (!dec && q < 15) q <= q + 1;
    end
  end
endmodule
