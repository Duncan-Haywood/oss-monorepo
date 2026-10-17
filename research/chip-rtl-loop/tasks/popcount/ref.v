module popcount_ref(input [15:0] x, output reg [4:0] n);
 integer i; always @* begin n=0; for(i=0;i<16;i=i+1) n=n+x[i]; end
endmodule
