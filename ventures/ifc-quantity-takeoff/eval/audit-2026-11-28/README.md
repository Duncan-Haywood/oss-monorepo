# Hand-written IFC files for the 2026-11-28 quality re-audit

Written by the auditor, not the tool's author, to recompute outputs by hand
(`portfolio/quality/audits/2026-11-28-ifc-quantity-takeoff-reaudit.json`).

- `audit-mm.ifc` (millimetres): IPE 300 steel beam 6 m and RHS 200x100x8
  steel post 4 m with no stored quantities; a 4 x 0.2 x 3 m wall with a
  1.2 x 1.0 m through window and a stored NetVolume 10% over the geometry
  (2.376 against 2.16); a full-turn revolved ring (100 x 200 mm at radius
  500); a 500 mm round column 3 m.
- `audit-cm.ifc` (centimetres): a 500 x 400 x 25 cm slab.

Expected, by hand: IPE 300 section 53.81 cm2 (2 x 150 x 10.7 + 278.6 x 7.1 +
(4 - pi) 15^2), 0.032287 m3, 6 m, 253.5 kg at 7,850 kg/m3 (table 42.2 kg/m:
253.2); RHS 4,544 mm2, 0.018176 m3, 142.68 kg; wall 2.4 gross, 2.16 net,
10.8 m2 net side; ring 2 pi x 0.5 x 0.02 = 0.062832 m3; column 0.589049 m3;
slab 5 m3 and 20 m2.

    node ventures/ifc-quantity-takeoff/cli.mjs ventures/ifc-quantity-takeoff/eval/audit-2026-11-28/audit-mm.ifc --rows /dev/stdout
    node ventures/ifc-quantity-takeoff/cli.mjs ventures/ifc-quantity-takeoff/eval/audit-2026-11-28/audit-mm.ifc --by class --unexplained geometry
