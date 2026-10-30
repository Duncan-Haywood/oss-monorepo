// Priority encoder: index of the most significant set bit, plus a valid flag.
module prio_enc #(parameter W = 64, parameter AW = 6) (input [W-1:0] x, output reg [AW-1:0] idx, output reg v);
  integer i;
  always @* begin
    idx = 0; v = 1'b0;
    for (i = 0; i < W; i = i + 1) if (x[i]) begin idx = i; v = 1'b1; end
  end
endmodule
