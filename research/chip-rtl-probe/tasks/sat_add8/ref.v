module sat_add8_ref(input [7:0] a, input [7:0] b, output [7:0] y);
  wire [8:0] s = {1'b0,a} + {1'b0,b};
  assign y = s[8] ? 8'hFF : s[7:0];
endmodule
