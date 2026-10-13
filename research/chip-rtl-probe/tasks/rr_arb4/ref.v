module rr_arb4_ref(input clk, input rst, input [3:0] req, output reg [3:0] grant);
  reg [1:0] last;
  integer k;
  reg [1:0] idx;
  always @* begin
    grant = 0; idx = 0;
    for (k = 1; k <= 4; k = k + 1)
      if (grant == 0 && req[(last + k) % 4]) begin grant[(last + k) % 4] = 1'b1; idx = (last + k) % 4; end
  end
  always @(posedge clk) if (rst) last <= 2'd3; else if (grant != 0) last <= idx;
endmodule
