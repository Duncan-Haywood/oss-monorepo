module prio_enc_ref(input [7:0] req, output reg [2:0] idx, output valid);
 integer i; assign valid = |req;
 always @* begin idx=0; for(i=0;i<8;i=i+1) if(req[i]) idx=i[2:0]; end
endmodule
