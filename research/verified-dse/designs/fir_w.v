// Combinational N-tap FIR output (a family no earlier table ran): y = sum_i c_i * x_i over a window of N signed W-bit samples, with fixed
// signed coefficients (an 8-tap symmetric low-pass set; taps beyond 8 reuse it). Constant-coefficient multipliers feeding an adder tree.
module fir_w #(parameter N = 8, parameter W = 12) (input [N*W-1:0] x, output signed [W+8+$clog2(N)-1:0] y);
  function automatic signed [8:0] coef(input integer i);
    case (i % 8)
      0, 7: coef = -9'sd3;
      1, 6: coef = 9'sd0;
      2, 5: coef = 9'sd19;
      default: coef = 9'sd32;
    endcase
  endfunction
  integer i;
  reg signed [W+8+$clog2(N)-1:0] acc;
  always @* begin
    acc = 0;
    for (i = 0; i < N; i = i + 1) acc = acc + $signed(x[i*W +: W]) * coef(i);
  end
  assign y = acc;
endmodule
