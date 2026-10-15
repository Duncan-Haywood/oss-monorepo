Module `prio_enc(input [7:0] req, output [2:0] idx, output valid)`.
Priority encoder: `idx` is the index of the HIGHEST set bit of `req` (bit 7 wins over bit 0). `valid` is 1 iff `req` is nonzero. When `req` is zero, `idx` must be 0.
