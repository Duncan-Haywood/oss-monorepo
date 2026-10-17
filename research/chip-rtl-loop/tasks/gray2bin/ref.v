module gray2bin_ref(input [7:0] g, output [7:0] b);
 assign b[7]=g[7]; genvar i; generate for(i=6;i>=0;i=i-1) begin:x assign b[i]=b[i+1]^g[i]; end endgenerate
endmodule
