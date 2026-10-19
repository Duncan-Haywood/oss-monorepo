// FPGA top for accel-plane's engines (written for this project). Operands come from a free-running shift
// register (no ROM, so no block RAM and no weight-memory effects), start is tied high, and the engine outputs
// are XOR-reduced into one registered pin so synthesis cannot drop any lane.
// ENG: 0 = os_engine, 1 = rt_engine (PIPE=0), 2 = rt_engine (PIPE=1)
module plane_top #(parameter ENG = 0, O = 64, I = 70, P = 4, WB = 4, ACCW = 24) (
    input wire clk, output reg y
);
    localparam XW = (ENG == 0) ? 8 : P * 8;
    localparam N = XW + P * WB;
    reg [N-1:0] sr = {N{1'b1}};
    reg [3:0] por = 4'd0;
    wire rst = ~por[3];
    always @(posedge clk) begin
        if (!por[3]) por <= por + 4'd1;
        sr <= {sr[N-2:0], sr[N-1] ^ sr[N-3] ^ sr[N/2] ^ sr[1]};
    end
    wire [XW-1:0]   x = sr[XW-1:0];
    wire [P*WB-1:0] w = sr[N-1:XW];
    generate
        if (ENG == 0) begin : g
            wire [P*ACCW-1:0] ov;
            os_engine #(.O(O), .I(I), .P(P), .WB(WB), .ACCW(ACCW)) e (.clk(clk), .rst(rst), .start(1'b1), .done(),
                .row_base(), .col(), .x_data(x[7:0]), .w_data(w), .out_valid(), .out_base(), .out_vec(ov));
            always @(posedge clk) y <= y ^ (^ov);
        end else begin : g
            wire signed [ACCW-1:0] ov;
            rt_engine #(.O(O), .I(I), .P(P), .WB(WB), .ACCW(ACCW), .PIPE(ENG == 2)) e (.clk(clk), .rst(rst),
                .start(1'b1), .done(), .row(), .col_base(), .x_data(x), .w_data(w), .out_valid(), .out_row(),
                .out_val(ov));
            always @(posedge clk) y <= y ^ (^ov);
        end
    endgenerate
endmodule
