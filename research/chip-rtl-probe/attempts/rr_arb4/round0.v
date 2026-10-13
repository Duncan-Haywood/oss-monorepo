module rr_arb4(input clk, input rst, input [3:0] req, output reg [3:0] grant);
  reg [1:0] last;
  always @* begin
    grant = 4'b0000;
    case (last)
      2'd0: if (req[1]) grant = 4'b0010; else if (req[2]) grant = 4'b0100; else if (req[3]) grant = 4'b1000; else if (req[0]) grant = 4'b0001;
      2'd1: if (req[2]) grant = 4'b0100; else if (req[3]) grant = 4'b1000; else if (req[0]) grant = 4'b0001; else if (req[1]) grant = 4'b0010;
      2'd2: if (req[3]) grant = 4'b1000; else if (req[0]) grant = 4'b0001; else if (req[1]) grant = 4'b0010; else if (req[2]) grant = 4'b0100;
      2'd3: if (req[0]) grant = 4'b0001; else if (req[1]) grant = 4'b0010; else if (req[2]) grant = 4'b0100; else if (req[3]) grant = 4'b1000;
    endcase
  end
  always @(posedge clk) begin
    if (rst) last <= 2'd3;
    else case (grant)
      4'b0001: last <= 2'd0;
      4'b0010: last <= 2'd1;
      4'b0100: last <= 2'd2;
      4'b1000: last <= 2'd3;
      default: last <= last;
    endcase
  end
endmodule
