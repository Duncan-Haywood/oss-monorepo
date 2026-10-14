module edge_det_ref(input clk, input rst, input x, output reg pulse);
 reg prev; always @(posedge clk) if(rst) begin prev<=0; pulse<=0; end else begin prev<=x; pulse<= x & ~prev; end
endmodule
