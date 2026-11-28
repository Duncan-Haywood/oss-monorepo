# SPRS guide texts

Text of DoD's own SPRS vendor guides, downloaded from https://www.sprs.csd.disa.mil/ on 28 Nov 2026
(each marked "Approved for public release; distribution is unlimited"), extracted with
`pdftotext <file>.pdf -` and whitespace collapsed (`tr -s ' \n\t\f' ' '`). `src/sprs-submit.mjs`
quotes them; `test/sprs-submit.test.mjs` pins each file's sha256 and finds every quotation word for word.

| File | PDF | PDF sha256 |
|---|---|---|
| `sprs-nist-800-171-quick-entry.txt` | `pdf/NISTSP800-171QuickEntryGuide.pdf` (V4.0, May 2024) | `23d7f1b7446fe4807ad5ad229d4a83fd0c5339c4a36ec06b563837237b9b73a8` |
| `sprs-cmmc-level-1-quick-entry.txt` | `pdf/CMMCQuickEntryGuide.pdf` (V4.0, Dec 2024) | `99876f9d3cb41fca6cb614cb1831d74a2f0b52c294d6acdb47effde812560e35` |
| `sprs-cmmc-level-2-quick-entry.txt` | `pdf/CMMCL2SelfQuickEntryGuide.pdf` (V4.0, Feb 2025) | `e43f4b6457fcfd472fd2a889fa6d1f89f021b4518eb8c4efe439e53069cd2ab8` |
| `sprs-access-with-piee.txt` | `pdf/SPRS_Access_NewUser_withPIEE_Vendor.pdf` (V4.1, Jul 2025) | `1e41be071b2060fdacc3751750c340871b2b5285a11f85dd366549af24cb8aad` |
| `sprs-access-new-piee.txt` | `pdf/SPRS_Access_NewUser_withoutPIEE_Vendor.pdf` (V4.1, Jul 2025) | `ba59d1827fd1647062911613e89f307341b202119fc49b4a369d2d4a1d2a6cf9` |
| `sprs-affirming-official-tutorial.txt` | `pdf/training/AffirmingOfficialTutorialforCMMC-Transcript.pdf` | `8ccf392aac3ce96ab27b332318433876b6de67952ccf33fd4e3ff94104eaaec7` |
