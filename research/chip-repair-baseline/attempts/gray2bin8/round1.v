module gray2bin8(input [7:0] g, output [7:0] b);
  assign b[7] = g[7];
  assign b[6] = b[7] ^ g[6];
  assign b[5] = b[6] ^ g[5];
  assign b[4] = b[5] ^ g[4];
  assign b[3] = b[4] ^ g[3];
  assign b[2] = b[3] ^ g[2];
  assign b[1] = b[2] ^ g[1];
  assign b[0] = b[1] ^ g[0];
endmodule
