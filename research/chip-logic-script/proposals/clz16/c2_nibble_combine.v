module clz16(input [15:0] a, output [4:0] n);
  function [1:0] c4(input [3:0] x);
    c4 = x[3] ? 0 : x[2] ? 1 : x[1] ? 2 : 3;
  endfunction
  wire v0 = |a[3:0], v1 = |a[7:4], v2 = |a[11:8], v3 = |a[15:12];
  wire [1:0] k0 = c4(a[3:0]), k1 = c4(a[7:4]), k2 = c4(a[11:8]), k3 = c4(a[15:12]);
  wire [1:0] blk = v3 ? 2'd0 : v2 ? 2'd1 : v1 ? 2'd2 : 2'd3;
  wire [1:0] in  = v3 ? k3 : v2 ? k2 : v1 ? k1 : k0;
  assign n = (v0|v1|v2|v3) ? {1'b0, blk, in} : 5'd16;
endmodule
