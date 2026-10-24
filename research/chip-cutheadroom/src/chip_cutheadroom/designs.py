"""Small arithmetic and control blocks, written behaviourally so Yosys picks the structure."""

DESIGNS = {
    "add16": ("module add16(input [15:0] a, b, output [16:0] s);\n  assign s = a + b;\nendmodule\n", "add16"),
    "mul6": ("module mul6(input [5:0] a, b, output [11:0] p);\n  assign p = a * b;\nendmodule\n", "mul6"),
    "lt16": ("module lt16(input [15:0] a, b, output y);\n  assign y = a < b;\nendmodule\n", "lt16"),
    "pop8": ("module pop8(input [7:0] x, output [3:0] c);\n"
             "  assign c = x[0]+x[1]+x[2]+x[3]+x[4]+x[5]+x[6]+x[7];\nendmodule\n", "pop8"),
    "shl8": ("module shl8(input [7:0] a, input [2:0] n, output [7:0] y);\n  assign y = a << n;\nendmodule\n", "shl8"),
    "prio16": ("module prio16(input [15:0] r, output reg [3:0] i, output v);\n  integer k;\n"
               "  assign v = |r;\n  always @* begin i = 0; for (k = 15; k >= 0; k = k - 1) if (r[k]) i = k; end\n"
               "endmodule\n", "prio16"),
}
