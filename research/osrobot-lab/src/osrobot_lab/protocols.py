"""Three reference protocols (deck, initial liquids, commands), built in code."""
from .model import tiprack, plate96, reservoir, tuberack


def _transfer(tips, state, src, sw, dst, dw, vol, **kw):
    """Command list for one transfer with a fresh tip from the next free tip well."""
    tw = tips["wells"][state["n"]]
    state["n"] += 1
    return [dict(op="pick_up_tip", labware=tips["name"], well=tw),
            dict(op="aspirate", labware=src, well=sw, vol=vol),
            dict(op="dispense", labware=dst, well=dw, vol=vol, **kw),
            dict(op="drop_tip")]


def serial_dilution(vx=50.0):
    """Row A of a plate: 2-fold dilution of a stock over 12 wells (vx uL of buffer per well, vx uL carried)."""
    deck = [tiprack("tips", 1), plate96("plate", 2), reservoir("buffer", 3)]
    tips = {"name": "tips", "wells": deck[0].wells()}
    st = {"n": 0}
    cmds = []
    for c in range(2, 13):
        cmds += _transfer(tips, st, "buffer", "A1", "plate", f"A{c}", vx)
    for c in range(1, 12):
        cmds += _transfer(tips, st, "plate", f"A{c}", "plate", f"A{c + 1}", vx)
    initial = {("plate", "A1"): (2 * vx, 1.0, "sample"), ("buffer", "A1"): (15000.0, 0.0, "sample")}
    return deck, initial, cmds


def replicate_plate():
    """Copy the 8 wells of column 1 of a source plate to a destination plate, fresh tip each (distinct samples)."""
    deck = [tiprack("tips", 1), plate96("src", 4), plate96("dst", 5)]
    tips = {"name": "tips", "wells": deck[0].wells()}
    st = {"n": 0}
    cmds = []
    for r in "ABCDEFGH":
        cmds += _transfer(tips, st, "src", f"{r}1", "dst", f"{r}1", 50.0)
    initial = {("src", f"{r}1"): (150.0, 1.0 + i, f"s{i}") for i, r in enumerate("ABCDEFGH")}
    return deck, initial, cmds


def master_mix():
    """One tip dispenses master mix from a tube to 16 wells, then four template samples go in with fresh tips.

    Tube rack in slot 2 sits between the tip rack (slot 1) and the plate (slot 3) on the first row of the deck.
    """
    deck = [tiprack("tips", 1), tuberack("tubes", 2), plate96("pcr", 3), plate96("templates", 6)]
    cmds = [dict(op="pick_up_tip", labware="tips", well="A1")]
    for i in range(16):
        cmds += [dict(op="aspirate", labware="tubes", well="A1", vol=20.0),
                 dict(op="dispense", labware="pcr", well=f"{'ABCDEFGH'[i % 8]}{i // 8 + 1}", vol=20.0)]
    cmds.append(dict(op="drop_tip"))
    tips = {"name": "tips", "wells": deck[0].wells()}
    st = {"n": 1}
    for i in range(4):
        cmds += _transfer(tips, st, "templates", f"A{i + 1}", "pcr", f"{'ABCDEFGH'[i]}1", 20.0)
    initial = {("tubes", "A1"): (1000.0, 1.0, "mix")}
    initial.update({("templates", f"A{i + 1}"): (100.0, 1.0, "mix") for i in range(4)})
    return deck, initial, cmds


PROTOCOLS = {"serial_dilution": serial_dilution, "replicate_plate": replicate_plate, "master_mix": master_mix}
