// Synthetic RFQ fixtures (invented company and parts, for tests and the offline demo only).
export const RFQ_EMAIL = `From: Dana Ortiz <dana.ortiz@example-robotics.test>
Company: Example Robotics LLC
Subject: RFQ - brackets and spacers

Hi, please quote the parts below.

Part number: BRK-1001 Rev B
Description: Motor mount bracket
Material: 6061-T6 aluminum plate
Qty: 10, 50, 100
Finish: Black anodize Type II
Tolerances: +/- .005 unless noted
Need by 2026-12-18

Part number: SPC-220
Description: Spacer, 0.50 OD
Material: 303 stainless bar
Qty: 250
Finish: Passivate

Thanks,
Dana`;

/** Text a PDF drawing's title block converts to (the fake converter decodes bytes as text). */
export const DRAWING_TEXT = `TITLE: MOTOR MOUNT BRACKET
DWG NO: BRK-1001 REV B
MATERIAL: 6061-T6 ALUMINUM
FINISH: BLACK ANODIZE TYPE II PER MIL-A-8625
UNLESS OTHERWISE SPECIFIED: .XXX +/- .005`;
