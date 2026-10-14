module updown4_ref(input clk, input rst, input en, input up, output reg [3:0] q);
  always @(posedge clk) if (rst) q <= 0; else if (en) q <= up ? q + 4'd1 : q - 4'd1;
endmodule
