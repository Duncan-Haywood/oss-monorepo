module div8(input [7:0] n, input [7:0] d, output reg [7:0] q, output reg [7:0] r);
  integer i;
  reg [7:0] rem;
  always @* begin
    rem = 0; q = 0;
    for (i = 7; i >= 0; i = i - 1) begin
      rem = {rem[6:0], n[i]};
      if (rem >= d) begin rem = rem - d; q[i] = 1; end
    end
    r = rem;
  end
endmodule
