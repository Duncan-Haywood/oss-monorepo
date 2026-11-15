// Milestone 133 blind design: a W-bit left shifter whose SW-bit amount is the CRC-7 (x^7 + x^3 + 1, the SD-card CRC, zero
// initial value, MSB first) of an NB-bit message field, as in shifting by a hash of a header field. The serial LFSR is unrolled
// into an xor network; NB is a dial for gate depth.
module crc7sh_w #(parameter W = 128, parameter SW = 7, parameter NB = 16)
    (input [W-1:0] x, input [NB-1:0] m, output [W-1:0] y);
  function [6:0] crc7(input [NB-1:0] v);
    integer i;
    reg fb;
    reg [6:0] c;
    begin
      c = 7'd0;
      for (i = NB - 1; i >= 0; i = i - 1) begin
        fb = c[6] ^ v[i];
        c = {c[5:0], 1'b0};
        if (fb) c = c ^ 7'h09;
      end
      crc7 = c;
    end
  endfunction
  wire [SW-1:0] s = crc7(m);
  assign y = x << s;
endmodule
