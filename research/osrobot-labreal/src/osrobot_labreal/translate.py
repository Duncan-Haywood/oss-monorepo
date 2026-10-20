"""Translate an osrobot-lab protocol (deck, initial liquids, command list) into an Opentrons Python API v2 script.

The script is generated text, so a mutated command list becomes the script a person would have written
with that mistake in it: a mistyped labware name is a KeyError at that line, a missing pick_up_tip is a
missing call. Nothing here imports opentrons; the simulator is run in sim.py.
"""

# osrobot-lab labware kind -> Opentrons load name (OT-2 definitions shipped with the package)
LOAD_NAME = {
    "tips": "opentrons_96_tiprack_300ul",
    "plate": "corning_96_wellplate_360ul_flat",
    "reservoir": "nest_12_reservoir_15ml",
    "tubes": "opentrons_24_tuberack_nest_1.5ml_snapcap",
}
API_LEVEL = "2.19"


def script(deck, initial, cmds, declare_liquids=True):
    """Return the protocol source. deck is a list of osrobot_lab Labware; initial maps (labware, well) -> (uL, conc, liquid)."""
    out = [f'metadata = {{"apiLevel": "{API_LEVEL}"}}', "", "def run(p):", "    L = {}"]
    tip_racks = []
    for lw in deck:
        out.append(f'    L[{lw.name!r}] = p.load_labware({LOAD_NAME[lw.kind]!r}, {lw.slot})')
        if lw.kind == "tips":
            tip_racks.append(lw.name)
    out.append('    pip = p.load_instrument("p300_single_gen2", "right", tip_racks=[%s])' % ", ".join(f"L[{n!r}]" for n in tip_racks))
    if declare_liquids and initial:
        liquids = sorted({liq for _, _, liq in initial.values()})
        for i, liq in enumerate(liquids):
            out.append(f'    liq{i} = p.define_liquid(name={liq!r}, description="", display_color="#336699")')
        for (lwn, w), (vol, _conc, liq) in sorted(initial.items()):
            out.append(f'    L[{lwn!r}][{w!r}].load_liquid(liq{liquids.index(liq)}, {vol!r})')
    for c in cmds:
        op = c["op"]
        if op == "pick_up_tip":
            out.append(f'    pip.pick_up_tip(L[{c["labware"]!r}][{c["well"]!r}])')
        elif op == "drop_tip":
            out.append("    pip.drop_tip()")
        elif op in ("aspirate", "dispense"):
            out.append(f'    pip.{op}({c["vol"]!r}, L[{c["labware"]!r}][{c["well"]!r}])')
        else:
            raise ValueError(f"no Opentrons equivalent for op {op!r}")
    return "\n".join(out) + "\n"
