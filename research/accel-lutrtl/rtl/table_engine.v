// Serial input-stationary product-table engine, same layer, weights shared via a K-entry codebook.
// For each input i: build T[j] = a[i]*c[j] (K cycles, one multiplier), then for each output o
// acc[o] += T[idx[i][o]] (N cycles, no multiplier). N accumulators are kept; then drained (N cycles).
module tbl_idx_rom #(parameter DEPTH = 2048, parameter AW = 11, parameter KB = 4, parameter FILE = "idx.hex")
  (input [AW-1:0] addr, output [KB-1:0] q);
  reg [KB-1:0] m [0:DEPTH-1];
  initial $readmemh(FILE, m);
  assign q = m[addr];
endmodule

module tbl_cb_rom #(parameter K = 16, parameter KB = 4, parameter FILE = "cb.hex")
  (input [KB-1:0] addr, output [7:0] q);
  reg [7:0] m [0:K-1];
  initial $readmemh(FILE, m);
  assign q = m[addr];
endmodule

module table_engine #(parameter N = 32, parameter FIN = 64, parameter K = 16,
                      parameter IDXFILE = "idx.hex", parameter CBFILE = "cb.hex")
  (input clk, input rst, input start, input [FIN*4-1:0] a_flat,
   output reg y_valid, output reg [15:0] y_idx, output reg signed [19:0] y, output reg done);
  localparam AW = $clog2(N*FIN);
  localparam KB = $clog2(K);
  localparam IDLE = 0, BUILD = 1, ACCUM = 2, DRAIN = 3;
  reg [1:0] st;
  reg [15:0] i, j, o;
  reg signed [11:0] T [0:K-1];            // 4-bit unsigned x 8-bit signed fits in 12 bits
  reg signed [19:0] acc [0:N-1];
  wire signed [7:0] c;
  tbl_cb_rom #(.K(K), .KB(KB), .FILE(CBFILE)) cbrom (.addr(j[KB-1:0]), .q(c));
  wire [AW-1:0] addr = i * N + o;
  wire [KB-1:0] ix;
  tbl_idx_rom #(.DEPTH(N*FIN), .AW(AW), .KB(KB), .FILE(IDXFILE)) irom (.addr(addr), .q(ix));
  wire [3:0] a = a_flat[i*4 +: 4];
  always @(posedge clk) begin
    y_valid <= 0; done <= 0;
    if (rst) begin st <= IDLE; i <= 0; j <= 0; o <= 0; end
    else case (st)
      IDLE: if (start) begin st <= BUILD; i <= 0; j <= 0; end
      BUILD: begin
        T[j[KB-1:0]] <= $signed({1'b0, a}) * c;
        if (j == K-1) begin st <= ACCUM; o <= 0; end else j <= j + 1;
      end
      ACCUM: begin
        acc[o] <= (i == 0 ? 20'sd0 : acc[o]) + T[ix];
        if (o == N-1) begin
          o <= 0; j <= 0;
          if (i == FIN-1) st <= DRAIN; else begin i <= i + 1; st <= BUILD; end
        end else o <= o + 1;
      end
      DRAIN: begin
        y_valid <= 1; y_idx <= o; y <= acc[o];
        if (o == N-1) begin st <= IDLE; done <= 1; end else o <= o + 1;
      end
    endcase
  end
endmodule
