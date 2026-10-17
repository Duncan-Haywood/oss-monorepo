module lfsr(input clk, input rst, input en, output [7:0] q);
  reg [7:0] r;
  assign q = r;
  wire fb = r[7] ^ r[5] ^ r[4] ^ r[3];
  always @(posedge clk) begin
    if (rst) r <= 8'h01;
    else if (en) r <= {r[6:0], fb};
  end
endmodule
