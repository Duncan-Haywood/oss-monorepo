---
kind: note
subjects: [einvoice-preflight]
tagged: auto
---
# Morocco ICE check key: not shipped as an error (agent note, 2026-11-09)

- Web sources (clicpaie.ma, safyr.ma, billora.ma, welipro) describe the ICE as 9 digits company + 4 digits establishment + 2-digit key; key = 97 - ((first 13 digits x 100) mod 97), equivalently all 15 digits divisible by 97.
- One worked example agrees: 001534931000016 (first 13 digits give remainder 81, key 16). A second published example (001234567000089) fails the rule, so it is probably made up.
- One source says ICEs issued before 2011 may not follow the key and stay valid. The DGI text is unread.
- Decision: `vat.mjs` keeps `MA` as shape only (15 digits). A hard INV-023 on a real pre-2011 ICE would be a false accusation in a tool whose job is not to cry wolf. To ship: get 3 or more real ICEs (public company registries) and see whether any fail the rule; if none, add it as a check, else add it as a warning only.
