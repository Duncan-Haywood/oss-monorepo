module rr_arb4_ref(input clk, input rst, input [3:0] req, output reg [3:0] gnt);
  reg [1:0] last;
  integer k; reg [1:0] i; reg found;
  always @* begin
    gnt = 0; found = 0;
    for (k = 1; k <= 4; k = k + 1) begin
      i = last + k[1:0];
      if (!found && req[i]) begin gnt[i] = 1; found = 1; end
    end
  end
  always @(posedge clk)
    if (rst) last <= 3;
    else if (gnt[0]) last <= 0; else if (gnt[1]) last <= 1;
    else if (gnt[2]) last <= 2; else if (gnt[3]) last <= 3;
endmodule
