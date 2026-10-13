module updown_ctr(input clk, input rst, input load, input [3:0] d, input up, input en, output [3:0] q);
  reg [3:0] r;
  assign q = r;
  always @(posedge clk) begin
    if (rst) r <= 4'd0;
    else if (load) r <= d;
    else if (en) r <= up ? r + 4'd1 : r - 4'd1;
  end
endmodule
