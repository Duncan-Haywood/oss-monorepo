// Eight one-hot controls (fanout 96 each) select among eight permuted 96-bit words by AND-OR, with a neighbour XOR so the outputs are not independent (high fanout plus depth).
module fanao (input [95:0] x, input [7:0] oh, output [95:0] y);
  wire [95:0] t;
  genvar i;
  generate for (i = 0; i < 96; i = i + 1) begin : g
    assign t[i] = (oh[0] & x[i]) | (oh[1] & x[(i * 3 + 1) % 96]) | (oh[2] & x[(i * 5 + 2) % 96]) | (oh[3] & ~x[(i * 7 + 3) % 96])
                | (oh[4] & x[(i * 11 + 4) % 96]) | (oh[5] & x[(i * 13 + 5) % 96]) | (oh[6] & ~x[(i * 17 + 6) % 96]) | (oh[7] & x[(i * 19 + 7) % 96]);
  end endgenerate
  assign y = t ^ {t[94:0], t[95]};
endmodule
