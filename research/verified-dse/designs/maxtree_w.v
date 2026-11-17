// Maximum of N unsigned W-bit values by a balanced compare-and-select tree (a family no earlier table ran; N a power of two). Each node
// is a W-bit comparator driving a W-bit 2:1 multiplexer: mux-heavy like a shifter, but its critical path is comparator carry chains.
module maxtree_w #(parameter N = 16, parameter W = 16) (input [N*W-1:0] x, output [W-1:0] y);
  wire [W-1:0] t [0:2*N-2];
  genvar i;
  generate
    for (i = 0; i < N; i = i + 1) begin : leaf
      assign t[N-1+i] = x[i*W +: W];
    end
    for (i = N - 2; i >= 0; i = i - 1) begin : node
      assign t[i] = (t[2*i+1] >= t[2*i+2]) ? t[2*i+1] : t[2*i+2];
    end
  endgenerate
  assign y = t[0];
endmodule
