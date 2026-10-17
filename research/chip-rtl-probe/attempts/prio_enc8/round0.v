module prio_enc8(input [7:0] req, output reg [2:0] idx, output valid);
  assign valid = |req;
  always @* begin
    casez (req)
      8'b1???????: idx = 7;
      8'b01??????: idx = 6;
      8'b001?????: idx = 5;
      8'b0001????: idx = 4;
      8'b00001???: idx = 3;
      8'b000001??: idx = 2;
      8'b0000001?: idx = 1;
      default:     idx = 0;
    endcase
  end
endmodule
