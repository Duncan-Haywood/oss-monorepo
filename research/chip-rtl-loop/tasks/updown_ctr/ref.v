module updown_ctr_ref(input clk, input rst, input load, input [3:0] d, input up, input en, output reg [3:0] q);
 always @(posedge clk) if(rst) q<=0; else if(load) q<=d; else if(en) q<= up ? q+1 : q-1;
endmodule
