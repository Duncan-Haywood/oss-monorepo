module gray2bin8_ref(input [7:0] g, output reg [7:0] b);
  integer i;
  always @* begin b[7] = g[7]; for (i=6;i>=0;i=i-1) b[i] = b[i+1] ^ g[i]; end
endmodule
