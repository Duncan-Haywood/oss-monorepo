// Milestone 137 confirmatory design: a W-bit left shifter whose SW-bit amount is the number of matching 4-bit nibbles between two
// K-nibble words p and q, as in advancing by the length of a tag match. K equality compares feed a counter written as a chain of
// increments (close to pcnsh_w's counter, with a compare in front of each bit), so K is a dial for gate depth. K < 2^SW.
module eqcntsh_w #(parameter W = 128, parameter SW = 7, parameter K = 8)
    (input [W-1:0] x, input [4*K-1:0] p, input [4*K-1:0] q, output [W-1:0] y);
  wire [SW-1:0] acc [0:K];
  assign acc[0] = 0;
  genvar i;
  generate for (i = 0; i < K; i = i + 1) begin : nb
    assign acc[i+1] = acc[i] + {{(SW-1){1'b0}}, p[4*i +: 4] == q[4*i +: 4]};
  end endgenerate
  assign y = x << acc[K];
endmodule
