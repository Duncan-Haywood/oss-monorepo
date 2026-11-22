# photo-editing: what has landed

Results moved out of `portfolio/flagships.yaml`'s `next:` by `portfolio/router/flagship_field.py` to keep that row under its 2000-character cap. The README and eval/ files each entry names hold the detail.

## Moved from flagships.yaml `next:`

- (moved 2026-11-19) Lensfun lens correction (--lens-db, grade stage; eval/lensfun-*, eval/lens-pipeline-grade-2026-11-13.md)
- (moved 2026-11-19) ARW, NEF, ORF, RW2, SRW, PEF, RAF (X-Trans; compressed 2026-11-15, eval/fujifilm-*) read directly since 2026-11-14 (eval/*-reader-*.md); RW2, ARW, SRW lenses from maker notes (eval/*-lens-2026-11-14.md); RW2 RawFormat 5-8 2026-11-15; Leica RWL, and a card copy that keeps all 27 raw formats, 2026-11-16
- (moved 2026-11-19) Bayer and X-Trans demosaics in C 2026-11-15 (eval/bayer-*, eval/xtrans-native-*)
- (moved 2026-11-19) NEF edge columns, real split rows, Z 6II curve, 12-bit black 2026-11-15 (eval/nikon-nef-*)
- (moved 2026-11-19) Canon CRW 2026-11-16 (eval/canon-crw-*)
- (moved 2026-11-19) Coolpix NRW and E-series NEF, Minolta MRW 2026-11-18 (eval/nikon-nrw-reader-*, eval/minolta-mrw-*)
- (moved 2026-11-19) Phase One IIQ L and S 2026-11-18, no .dcp: file's matrix (eval/phaseone-iiq-*); Hasselblad 3FR and Phocus .fff (eval/hasselblad-*)
- (moved 2026-11-19) Kodak DCR 2026-11-18 = LibRaw (eval/kodak-dcr-*)
- (moved 2026-11-19) RW2 RawFormat 8 2026-11-18: S1R II, S5 IIX, S1 II E; 4 x 2 tiles (177 MP); no public file has a tone curve (eval/panasonic-rw2-format8-grid-*)
- (moved 2026-11-22) IIQ 16-bit (IQ4, IQ3 100MP, Trichromatic) 2026-11-18 = LibRaw; IQ4 matrix vs LibRaw's dE 16, unsettled (eval/phaseone-iiq-16bit-*)
- (moved 2026-11-22) IIQ calibration (0x110) 2026-11-19: LibRaw's to 3 codes off dead columns (eval/phaseone-iiq-calibration-*)
- (moved 2026-11-22) mpcw1 (select once at mpcw's level) failed its gates 2026-11-22: 1.48x mpcw on that tile, +0.01 of mpcws's +0.26 dB
- (moved 2026-11-22) mpcws (held +0.31 dB) failed on K-1 II not by a noisy truth: a green-pair truth read failed its validity tests 2026-11-22, and mpcws's own selection over-reads 2.3x there (eval/noise-pca-mpcws-noisy-truth-*)
- (moved 2026-11-22) q ramps refit 2026-11-22 (eval/hdrplus-ramp-fit-*): ship's pick fails h3/h4 on 79 fresh bursts, ramps stay
