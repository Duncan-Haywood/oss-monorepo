// Serial output-stationary MAC engine for one dense layer: y[o] = sum_i a[i] * w[o][i].
// a: FIN unsigned 4-bit activations, held stable on the port. w: signed 8-bit, from a ROM.
module mac_rom #(parameter DEPTH = 2048, parameter AW = 11, parameter FILE = "w.hex")
  (input [AW-1:0] addr, output [7:0] q);
  reg [7:0] m [0:DEPTH-1];
  initial $readmemh(FILE, m);
  assign q = m[addr];
endmodule

module mac_engine #(parameter N = 32, parameter FIN = 64, parameter FILE = "w.hex")
  (input clk, input rst, input start, input [FIN*4-1:0] a_flat,
   output reg y_valid, output reg [15:0] y_idx, output reg signed [19:0] y, output reg done);
  localparam AW = $clog2(N*FIN);
  reg busy;
  reg [15:0] o, i;
  reg signed [19:0] acc;
  wire [AW-1:0] addr = o * FIN + i;
  wire signed [7:0] w;
  mac_rom #(.DEPTH(N*FIN), .AW(AW), .FILE(FILE)) rom (.addr(addr), .q(w));
  wire [3:0] a = a_flat[i*4 +: 4];
  wire signed [19:0] nxt = acc + $signed({1'b0, a}) * w;
  always @(posedge clk) begin
    y_valid <= 0; done <= 0;
    if (rst) begin busy <= 0; o <= 0; i <= 0; acc <= 0; end
    else if (start && !busy) begin busy <= 1; o <= 0; i <= 0; acc <= 0; end
    else if (busy) begin
      if (i == FIN-1) begin
        y_valid <= 1; y_idx <= o; y <= nxt; acc <= 0; i <= 0;
        if (o == N-1) begin busy <= 0; done <= 1; end else o <= o + 1;
      end else begin acc <= nxt; i <= i + 1; end
    end
  end
endmodule
