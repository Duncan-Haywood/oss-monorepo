// Three broadcast controls (fanout 192 each) gate a permuted 192-bit word into 192 outputs (high-fanout nets, no deep logic).
module bcastmix (input [191:0] x, input [2:0] k, output [191:0] y);
  genvar i;
  generate for (i = 0; i < 192; i = i + 1) begin : g
    assign y[i] = (k[0] & x[i]) ^ (k[1] & x[(i * 7 + 3) % 192]) ^ (k[2] & ~x[(i * 13 + 5) % 192]);
  end endgenerate
endmodule
