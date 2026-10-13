// Exhaustive 4-bit testbench for both adders; prints "a b ripple op".
module tb_adder;
    reg [3:0] a, b;
    wire [4:0] s1, s2;
    adder_ripple #(.W(4)) u1 (.a(a), .b(b), .s(s1));
    adder_op     #(.W(4)) u2 (.a(a), .b(b), .s(s2));
    integer i, j;
    initial begin
        for (i = 0; i < 16; i = i + 1)
            for (j = 0; j < 16; j = j + 1) begin
                a = i; b = j; #1;
                $display("%0d %0d %0d %0d", a, b, s1, s2);
            end
        $finish;
    end
endmodule
