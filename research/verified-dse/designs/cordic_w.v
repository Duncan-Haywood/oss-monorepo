// N unrolled CORDIC rotation stages on W-bit signed x, y and angle z (a family no earlier table ran): stage i adds or subtracts y >>> i
// and x >>> i by the sign of z and steps z by atan(2^-i), here in units of 2^-14 rad (round(atan(2^-i) * 2^14)). A chain of N
// carry-propagate add/subtracts whose operation depends on the previous stage's sign: deep, with a mux at every stage.
module cordic_w #(parameter N = 8, parameter W = 16) (input signed [W-1:0] x0, y0, z0, output signed [W-1:0] xn, yn, zn);
  function automatic signed [W-1:0] atan(input integer i);
    case (i)
      0: atan = 12868; 1: atan = 7596; 2: atan = 4014; 3: atan = 2037; 4: atan = 1023; 5: atan = 512; 6: atan = 256; 7: atan = 128;
      8: atan = 64; 9: atan = 32; 10: atan = 16; 11: atan = 8; 12: atan = 4; 13: atan = 2; 14: atan = 1; default: atan = 0;
    endcase
  endfunction
  wire signed [W-1:0] x [0:N], y [0:N], z [0:N];
  assign x[0] = x0; assign y[0] = y0; assign z[0] = z0;
  genvar i;
  generate
    for (i = 0; i < N; i = i + 1) begin : st
      wire d = z[i][W-1];  // 1 when z < 0: rotate the other way
      assign x[i+1] = d ? x[i] + (y[i] >>> i) : x[i] - (y[i] >>> i);
      assign y[i+1] = d ? y[i] - (x[i] >>> i) : y[i] + (x[i] >>> i);
      assign z[i+1] = d ? z[i] + atan(i) : z[i] - atan(i);
    end
  endgenerate
  assign xn = x[N]; assign yn = y[N]; assign zn = z[N];
endmodule
