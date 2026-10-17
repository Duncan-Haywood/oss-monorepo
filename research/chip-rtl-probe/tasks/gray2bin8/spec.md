Module `gray2bin8`: ports `input [7:0] g, output [7:0] b`. Combinational. `g` is a reflected-binary Gray code; `b` is the binary value it encodes (`b[7]=g[7]`, `b[i]=b[i+1]^g[i]`).
