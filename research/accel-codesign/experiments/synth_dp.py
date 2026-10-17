"""Yosys generic-gate cell counts of rtl/mac_dp.v over lanes P and weight bits. Writes datapath_area.json."""
import json, os, re, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__)); rtl = os.path.join(here, "..", "rtl", "mac_dp.v")
out = {}
for wb in (2, 3, 4, 8):
    out[str(wb)] = {}
    for p in (1, 2, 4, 8, 16, 32):
        ys = (f"read_verilog {rtl}; chparam -set P {p} mac_dp; chparam -set WB {wb} mac_dp; hierarchy -top mac_dp; "
              "synth -flatten -top mac_dp; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX; tee -o /dev/stdout stat")
        o = subprocess.run(["yosys", "-q", "-p", ys], check=True, capture_output=True, text=True).stdout
        out[str(wb)][str(p)] = int(re.search(r"Number of cells:\s+(\d+)", o).group(1))
ver = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
json.dump({"yosys": ver, "cells": out}, open(os.path.join(here, "datapath_area.json"), "w"), indent=1)
print(ver); [print(k, v) for k, v in out.items()]
