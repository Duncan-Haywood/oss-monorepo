"""Bill of materials for the three build stages, with prices and their sources.

Prices were read from retailer pages on 2026-10-02 (or taken from the LeKiwi / SO-ARM100
BOMs where marked "BOM-stated"); they move, so treat totals as a guide. Items without a
checked price are listed separately and left out of the totals rather than guessed.

    PYTHONPATH=src python -m homebot.analysis.bom    # writes hardware/BOM.md
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from ..mjcf import MASS_FILE

STAGES = ("arm", "torso", "mobile")
STAGE_NAMES = {"arm": "A. One arm on a desk post", "torso": "B. Two arms + head on a desk post",
               "mobile": "C. Full mobile robot"}


@dataclass
class Item:
    name: str
    qty: dict  # stage -> quantity (in units of the priced item)
    price: float  # USD per priced unit
    source: str
    note: str = ""


ITEMS = [
    Item("Feetech STS3215 servo, 12 V, 30 kg*cm (C018/C047, 1/345)", {"arm": 8, "torso": 18, "mobile": 22}, 15.99,
         "shop.wowrobo.com (single $15.99; $13.99 each in 10-packs); Seeed C047 $23.99",
         "arm 8 + arm 8 + head 2 + lift 1 + wheels 3"),
    Item("Waveshare Bus Servo Adapter (A) (USB to servo bus)", {"arm": 1, "torso": 1, "mobile": 2}, 4.99,
         "waveshare.com/bus-servo-adapter-a.htm", "mobile: one for the arms, one for base/lift/head"),
    Item("12 V 8.5 A power supply (Mean Well LRS-100-12)", {"arm": 1, "torso": 1, "mobile": 1}, 17.57,
         "trcelectronics.com/products/mean-well-lrs-100-12", "bench supply; the mobile robot also runs tethered"),
    Item("3S 5000 mAh LiPo (CNHL)", {"mobile": 1}, 27.99, "chinahobbyline.com (3S 5000 mAh, $27.99-37.99)",
         "3S only: a 4S pack exceeds the servo's 14 V cut-off"),
    Item("3S LiPo balance charger (ISDT 608AC)", {"mobile": 1}, 64.99,
         "chinahobbyline.com/products/isdt-608ac-smart-balance-charger", "skip if you own one"),
    Item("12 V -> 5 V 5 A buck converter (for the Pi)", {"mobile": 1}, 9.99, "LeKiwi BOM (Amazon, BOM-stated)",
         "Pololu D36V50F5 is $39.95 (pololu.com/product/4091)"),
    Item("Raspberry Pi 5, 4 GB", {"mobile": 1}, 110.00, "raspberrypi.com/news (official price from 1 Apr 2026)",
         "desk stages run from a laptop over USB"),
    Item("USB webcam (head camera)", {"torso": 1, "mobile": 1}, 12.98, "LeKiwi BOM (BOM-stated)"),
    Item("2020 V-slot extrusion, per metre (mast)", {"mobile": 1}, 14.99,
         "3dprintingusa.com/products/v-slot-extrusion-20mm-x-20mm-x-1m-in-store-only", "V-slot needed for the V-wheels"),
    Item("2020 extrusion, any slot, per metre (post, spokes)", {"arm": 1.2, "torso": 1.25, "mobile": 0.35}, 6.59,
         "vevor.com (10 x 1 m for $65.90)", "desk post 1.2-1.25 m; three 117 mm spokes"),
    Item("OpenBuilds Mini V gantry set (4 POM mini V-wheels, eccentric spacers)", {"mobile": 1}, 30.02,
         "3dprintingusa.com/products/openbuilds-mini-v-gantry-set-with-mini-pom-v-wheels", "lift carriage; plate unused"),
    Item("GT2 6 mm belt, per metre", {"mobile": 2.2}, 3.54, "3dprintingusa.com/products/gt2-6mm-timing-belt-1-metre",
         "omega drive of the lift"),
    Item("608ZZ bearings, 10-pack", {"arm": 1, "torso": 1, "mobile": 1}, 8.88,
         "vxb.com/products/10-pack-608zz-ball-bearings-8x22x7mm", "4 per arm (geared shoulder joints)"),
    Item("6806ZZ bearing 30x42x7", {"arm": 2}, 19.99, "vxb.com/products/6806zz-bearing-30x42x7-shielded",
         "2 per arm (upper-arm and forearm roll)"),
    Item("6806ZZ bearings, 10-pack", {"torso": 1, "mobile": 1}, 49.98,
         "vxb.com/products/10pcs-6806zz-ball-bearings-30x42x7mm-thin-section", "4 needed"),
    Item("623ZZ bearings, 10-pack", {"mobile": 1}, 29.99,
         "vxb.com/products/623zz-10-bearing-shielded-3x10x4-miniature", "2 belt idlers"),
    Item("M5 T-nuts for 2020, 10-pack", {"arm": 1, "torso": 1, "mobile": 2}, 3.54,
         "3dprintingusa.com/products/m5-sliding-t-nuts-for-20-series-10-pack"),
    Item("M2-M5 socket-head screw and nut set", {"arm": 1, "torso": 1, "mobile": 1}, 59.99,
         "vxb.com (2024-piece 12.9 metric set)", "LeKiwi's BOM lists an M2/M3/M4 assortment at $14.99"),
    Item("100 mm omni wheel (AndyMark DuraOmni 4 in)", {"mobile": 3}, 29.00, "andymark.com/products/duraomni-wheel",
         "the printed hub matches its 6 x 4 mm, 47.6 mm bolt circle; VEX 4 in omni is $9.99 per the LeKiwi BOM"),
]

UNPRICED = [
    "M8 x 60 bolts with nyloc nuts (shoulder shafts): 4 per arm",
    "625ZZ bearings (5 x 16 x 5 mm) and an M5 x 45 bolt with nyloc nut (geared elbow): 2 + 1 per arm",
    "4 mm steel rod, 100 mm long (gripper guides; 304 stainless or silver steel): 2 per arm",
    "M4 shoulder screw (or M4 bolt) and M4 heat-set insert (wrist-pitch pivot): 1 per arm",
    "TPU 95A filament for the jaw pads: about 4 g per arm",
    "Servo extension cables (the STS3215 ships with one 3-pin cable)",
    "Wire, XT60 connector and an inline fuse/switch for the battery (mobile)",
]
TPU_PARTS = {"pad"}  # printed in TPU, not counted in the PLA total

# Budget route: same parts, cheapest sourced options (servo 10-packs, VEX omni wheels with
# LeKiwi's hub, the $14.99 screw assortment, a laptop instead of the Pi, an existing charger).
BUDGET = {"Feetech": 13.99, "omni wheel": 9.99, "screw and nut set": 14.99, "Raspberry Pi": 0.0, "charger": 0.0}

PLA_PRICE = 17.99  # USD/kg, Polymaker Panchroma Basic refill or Overture Easy PLA (us.polymaker.com, overture3d.com)

ARM_PARTS = {"gear42": 2, "pinion": 2, "shoulder_block": 1, "upper_arm_top": 1, "upper_arm": 1,
             "elbow_pinion": 1, "elbow_gear": 1, "forearm_clevis": 1, "forearm": 1, "wrist_clevis": 1, "hand": 1,
             "grip_pinion": 1, "jaw": 2, "pad": 2}
STAGE_PARTS = {
    "arm": {**ARM_PARTS, "carriage": 2, "post_foot": 1},
    "torso": {**{k: 2 * v for k, v in ARM_PARTS.items()}, "carriage": 2, "post_foot": 1, "mast_cap": 1, "neck": 1,
              "head": 1},
    "mobile": {**{k: 2 * v for k, v in ARM_PARTS.items()}, "carriage": 2, "mast_cap": 1, "neck": 1, "head": 1,
               "pulley": 1, "hub": 1, "wheel_mount": 3, "wheel_hub": 3, "deck": 6},
}


def printed_mass(stage: str) -> float:
    props = json.loads(Path(MASS_FILE).read_text())
    return sum(props[p]["mass"] * n for p, n in STAGE_PARTS[stage].items() if p not in TPU_PARTS)


def totals() -> dict:
    out = {}
    for st in STAGES:
        bought = sum(it.price * it.qty.get(st, 0) for it in ITEMS)
        pla_kg = printed_mass(st) * 1.15  # +15 % for supports, brims and failed prints
        budget = 0.0
        for it in ITEMS:
            price = next((v for k, v in BUDGET.items() if k in it.name), it.price)
            budget += price * it.qty.get(st, 0)
        out[st] = {"bought_usd": bought, "pla_kg": pla_kg, "pla_usd": pla_kg * PLA_PRICE,
                   "total_usd": bought + pla_kg * PLA_PRICE, "budget_total_usd": budget + pla_kg * PLA_PRICE,
                   "servos": next(it.qty.get(st, 0) for it in ITEMS if "STS3215" in it.name)}
    return out


def markdown() -> str:
    t = totals()
    lines = ["# Bill of materials", "",
             "Generated by `python -m homebot.analysis.bom` from `src/homebot/analysis/bom.py`. "
             "Prices in USD, read from the listed retailer pages on 2026-10-02 unless marked "
             "*BOM-stated* (taken from the LeKiwi or SO-ARM100 bills of materials). Prices move; "
             "shipping and tax are not included. Items without a checked price are listed at the "
             "end and are **not** in the totals.", "",
             "| Item | A | B | C | Unit price | Source | Note |", "|---|---|---|---|---|---|---|"]
    for it in ITEMS:
        q = [f"{it.qty.get(s, 0):g}" if it.qty.get(s, 0) else "" for s in STAGES]
        lines.append(f"| {it.name} | {q[0]} | {q[1]} | {q[2]} | ${it.price:.2f} | {it.source} | {it.note} |")
    lines += ["", "| Stage | Servos (DOF) | Bought parts | PLA (incl. 15 % waste) | Total | Budget route |",
              "|---|---|---|---|---|---|"]
    for st in STAGES:
        r = t[st]
        lines.append(f"| {STAGE_NAMES[st]} | {r['servos']} | ${r['bought_usd']:.0f} | {r['pla_kg']:.2f} kg, "
                     f"${r['pla_usd']:.0f} | **${r['total_usd']:.0f}** | ${r['budget_total_usd']:.0f} |")
    lines += ["", f"PLA at ${PLA_PRICE}/kg (Polymaker Panchroma Basic refill, us.polymaker.com; Overture Easy PLA, "
              "overture3d.com). Printed masses come from `hardware/mass_properties.json` "
              "(3 perimeters, 25 % infill). The jaw pads (`pad`) are printed in TPU and are not in the PLA total.", "",
              "Budget route: servos in 10-packs ($13.99 each), the VEX 4 in omni wheel ($9.99, BOM-stated) "
              "with LeKiwi's printed hub instead of `wheel_hub`, the $14.99 screw assortment (BOM-stated), a laptop "
              "on a USB cable instead of the Raspberry Pi, and a LiPo charger you already own.", "",
              "Not priced (small parts, buy locally):", ""]
    lines += [f"- {u}" for u in UNPRICED]
    lines += ["", "Printed parts per stage:", ""]
    props = json.loads(Path(MASS_FILE).read_text())
    lines += ["| Part | A | B | C | Mass each (g) | Print size (mm) |", "|---|---|---|---|---|---|"]
    allp = sorted({p for st in STAGES for p in STAGE_PARTS[st]})
    for p in allp:
        q = [str(STAGE_PARTS[s].get(p, "")) for s in STAGES]
        lines.append(f"| `{p}` | {q[0]} | {q[1]} | {q[2]} | {props[p]['mass'] * 1000:.0f} | "
                     f"{' x '.join(f'{v:.0f}' for v in props[p]['print_dims_mm'])} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    out = Path(MASS_FILE).parent / "BOM.md"
    out.write_text(markdown())
    for st, r in totals().items():
        print(st, {k: round(v, 2) if isinstance(v, float) else v for k, v in r.items()})
