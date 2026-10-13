module seq_1011_ref(input clk, input rst, input x, output hit);
 reg [2:0] h; reg [1:0] n;
 assign hit = (h==3'b101) & x & (n==3);
 always @(posedge clk) if(rst) begin h<=0; n<=0; end else begin h<={h[1:0],x}; if(n!=3) n<=n+1; end
endmodule
