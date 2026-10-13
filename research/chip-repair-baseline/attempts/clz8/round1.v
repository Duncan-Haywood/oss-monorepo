module clz8(input [7:0] x, output reg [3:0] n);
  always @* begin
    casez (x)
      8'b1???????: n = 0;
      8'b01??????: n = 1;
      8'b001?????: n = 2;
      8'b0001????: n = 3;
      8'b00001???: n = 4;
      8'b000001??: n = 5;
      8'b0000001?: n = 6;
      8'b00000001: n = 7;
      default: n = 8;
    endcase
  end
endmodule
