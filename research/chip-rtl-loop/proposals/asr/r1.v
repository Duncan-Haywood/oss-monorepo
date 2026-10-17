module asr(input signed [7:0] x, input [2:0] amt, output signed [7:0] y);
  // feedback: '>>' zero-fills; '>>>' on a signed operand sign-extends
  assign y = x >>> amt;
endmodule
