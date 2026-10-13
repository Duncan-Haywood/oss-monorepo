Module `gray2bin8`: input `[7:0] g` (reflected Gray code), output `[7:0] b` (the binary value). `b[7] = g[7]` and `b[i] = b[i+1] ^ g[i]` for i = 6 down to 0. Purely combinational.
