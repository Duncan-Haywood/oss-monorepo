// Bitonic-free odd-even merge sorting network for 8 unsigned W-bit keys (19 compare-exchanges).
module sort_net #(parameter W = 8) (input [8*W-1:0] a, output [8*W-1:0] y);
  reg [W-1:0] v [0:7];
  reg [W-1:0] t;
  integer i;
  task ce(input integer p, input integer q);
    begin if (v[p] > v[q]) begin t = v[p]; v[p] = v[q]; v[q] = t; end end
  endtask
  always @* begin
    for (i = 0; i < 8; i = i + 1) v[i] = a[i*W +: W];
    ce(0,1); ce(2,3); ce(4,5); ce(6,7);
    ce(0,2); ce(1,3); ce(4,6); ce(5,7);
    ce(1,2); ce(5,6);
    ce(0,4); ce(1,5); ce(2,6); ce(3,7);
    ce(2,4); ce(3,5);
    ce(1,2); ce(3,4); ce(5,6);
  end
  genvar g;
  generate for (g = 0; g < 8; g = g + 1) begin : o assign y[g*W +: W] = v[g]; end endgenerate
endmodule
