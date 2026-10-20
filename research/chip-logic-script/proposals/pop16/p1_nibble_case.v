module pop16(input [15:0] a, output [4:0] c);
  function [2:0] p4(input [3:0] x);
    case (x)
      4'b0000: p4 = 0;
      4'b0001, 4'b0010, 4'b0100, 4'b1000: p4 = 1;
      4'b1111: p4 = 4;
      4'b0111, 4'b1011, 4'b1101, 4'b1110: p4 = 3;
      default: p4 = 2;
    endcase
  endfunction
  wire [2:0] n0 = p4(a[3:0]), n1 = p4(a[7:4]), n2 = p4(a[11:8]), n3 = p4(a[15:12]);
  assign c = ({1'b0, n0} + {1'b0, n1}) + ({1'b0, n2} + {1'b0, n3});
endmodule
