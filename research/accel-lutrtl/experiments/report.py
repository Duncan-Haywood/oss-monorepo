import json, os
d = os.path.dirname(__file__)
rows = json.load(open(f"{d}/results.json"))
L = ["layer 64 inputs x N outputs, 4-bit activations, int8 shared weights; GE = assumed gate equivalents",
     "N | K | bit-exact | cycles mac/table | datapath GE mac/table (ratio) | flops mac/table | stored bits mac/table | ROM-logic GE mac/table | break-even GE per stored bit"]
for r in rows:
    m, t = r["mac"], r["table"]
    dg = t["dp_ge"] - m["dp_ge"]
    saved = m["stored_bits"] - t["stored_bits"]
    be = f"{dg/saved:.2f}" if saved > 0 else "n/a"
    L.append(f"{r['N']} | {r['K']} | {m['bit_exact_3_seeds'] and t['bit_exact_3_seeds']} | {m['cycles']}/{t['cycles']} | "
             f"{m['dp_ge']:.0f}/{t['dp_ge']:.0f} ({t['dp_ge']/m['dp_ge']:.2f}x) | {m['dp_ff']}/{t['dp_ff']} | "
             f"{m['stored_bits']}/{t['stored_bits']} | {m['rom_ge']:.0f}/{t['rom_ge']:.0f} | {be}")
open(f"{d}/results.txt", "w").write("\n".join(L) + "\n")
print("\n".join(L))
