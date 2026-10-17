module rotl8_ref(input [7:0] a, input [2:0] n, output [7:0] y);
  wire [15:0] d = {a,a} << n;
  assign y = d[15:8];
endmodule
