# Corpus

Public-domain chant in GABC, one file per piece. It is empty on purpose until a
piece has been transcribed from a source anyone can check.

Each file's header carries:

```
name: Pange lingua;
mode: 3;
office-part: Hymnus;
source: edition, year, page and scan URL (e.g. Graduale Romanum, Vatican edition 1908, p. NNN);
transcriber: who typed it and when;
%%
```

Rules:

- **Public domain only.** Use the 1908 Vatican edition and other editions
  printed before 1929 (US public domain). A newer edition can carry its own
  copyright: check before using it.
- **Third-party transcriptions** (GregoBase and the like): record their licence
  here before copying any of them. It was not checked as of 2026-11-03.
- **Every piece must pass** `node ../cli.mjs piece.gabc`'s mode/final check, or
  the file must say why it doesn't (for example, a transposed final).
