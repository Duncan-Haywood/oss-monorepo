module satcnt4_ref(input clk, input rst, input en, input dec, output reg [3:0] q);
  always @(posedge clk)
    if (rst) q <= 0;
    else if (en) begin
      if (dec) begin if (q != 0) q <= q - 1; end
      else begin if (q != 15) q <= q + 1; end
    end
endmodule
