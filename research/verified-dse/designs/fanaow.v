// Eight one-hot controls (fanout W each; W is the sweep variable of milestone 73) select among eight permuted W-bit words by AND-OR, with a neighbour XOR so the outputs are not independent (high fanout plus depth).
module fanaow #(parameter W = 96) (input [W-1:0] x, input [7:0] oh, output [W-1:0] y);
  wire [W-1:0] t;
  genvar i;
  generate for (i = 0; i < W; i = i + 1) begin : g
    assign t[i] = (oh[0] & x[i]) | (oh[1] & x[(i * 3 + 1) % W]) | (oh[2] & x[(i * 5 + 2) % W]) | (oh[3] & ~x[(i * 7 + 3) % W])
                | (oh[4] & x[(i * 11 + 4) % W]) | (oh[5] & x[(i * 13 + 5) % W]) | (oh[6] & ~x[(i * 17 + 6) % W]) | (oh[7] & x[(i * 19 + 7) % W]);
  end endgenerate
  assign y = t ^ {t[W-2:0], t[W-1]};
endmodule
