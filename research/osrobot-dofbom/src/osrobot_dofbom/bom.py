"""Bill of materials for an n-joint feeding arm built from the published SO-ARM101 parts list. Stdlib only.

Every price is a line of the SO-ARM101 sourcing tables (Apache-2.0, https://github.com/uofrobotics/SO-ARM101,
README read 2026-10-21, "Parts for One Follower Arm" and "Parts For Two Arms") or a retailer listing read on 2026-10-19
by osrobot-dof. Nothing is invented; printed parts are a swept range, flagged as such.
"""

# name: (unit price USD, source). "pack" parts are priced per pack as the table lists them.
PARTS = {
    "servo":   (13.89, "SO-ARM101 table, STS3215 7.4 V, Alibaba, unit cost (US)"),
    "board":   (10.60, "SO-ARM101 table, motor control board (Waveshare, Amazon), one drives every servo"),
    "usb":     (7.00,  "SO-ARM101 table, USB-C cable 2 pcs, per pack"),
    "psu":     (10.00, "SO-ARM101 table, power supply"),
    "clamp":   (5.00,  "SO-ARM101 table, table clamp 2 pcs, per pack (one-arm table)"),
    "tools":   (6.00,  "SO-ARM101 table, screwdriver set (one-off tool)"),
}
# Servo prices for the other two sourcing channels (osrobot-dof README, read 2026-10-19)
SERVO_CHANNELS = {"alibaba (SO-ARM101 table)": 13.89, "AIFit Lab retail": 26.00, "RobotShop US retail": 49.22}

# Operational-space tip mass along the approach, kg: osrobot-dof experiments/results.txt, Sweep 1
TIP_MASS_KG = {2: 0.628, 3: 0.591, 4: 0.589, 5: 0.492, 6: 0.502}

LINK_KG_PER_M = 0.20      # printed link line density, osrobot-dof model.py
REACH_M = 0.50            # total reach, osrobot-dof model.py
SPOON_KG = 0.050          # osrobot-dof model.py
FILAMENT_USD_PER_KG = (15.0, 40.0)   # swept, not sourced: the range hobby PLA/PETG spools span

def printed_kg(n):
    """Printed link mass: osrobot-dof fixes total reach, so it does not change with joint count."""
    return LINK_KG_PER_M * REACH_M

def bom(n, servo_usd=None, include_tools=True, gripper=False, filament_usd_per_kg=None):
    """Line items {name: usd} for an n-joint arm. `gripper` adds one more servo (SO-101 follower has six, one a gripper)."""
    if n < 1:
        raise ValueError("an arm needs at least one joint")
    su = PARTS["servo"][0] if servo_usd is None else servo_usd
    items = {"servos": su * (n + (1 if gripper else 0)),
             "board": PARTS["board"][0], "usb": PARTS["usb"][0], "psu": PARTS["psu"][0], "clamp": PARTS["clamp"][0]}
    if include_tools:
        items["tools"] = PARTS["tools"][0]
    if filament_usd_per_kg is not None:
        items["printed"] = filament_usd_per_kg * printed_kg(n)
    return items

def total(n, **kw):
    return sum(bom(n, **kw).values())

def fixed_share(n, **kw):
    items = bom(n, **kw)
    return 1.0 - items["servos"] / sum(items.values())

def ratio(n_hi, n_lo, **kw):
    return total(n_hi, **kw) / total(n_lo, **kw)

def servo_price_for_ratio(target, n_hi=6, n_lo=2, **kw):
    """Servo price at which total(n_hi)/total(n_lo) equals `target` (1 < target < n_hi/n_lo), by the closed form."""
    fixed = total(n_lo, servo_usd=0.0, **kw)
    return fixed * (target - 1.0) / (n_hi - target * n_lo)
