# dmarc-report-reader

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/dmarc-report-reader/>

After using this, you can now **read the DMARC aggregate reports your `rua=`
mailbox collects** and know which sending sources fail alignment and why,
which used to need a paid dashboard or squinting at XML.

`index.html` runs in the browser and uploads nothing. Drop `.xml`, `.xml.gz` or
single-file `.zip` reports (many at once merge). You get:

- aligned share of volume, failing messages and failing senders;
- one row per sending IP with aligned/failing counts;
- a plain-English fix per failing sender (no DKIM, DKIM signs the vendor's
  domain, SPF passes for the vendor's bounce domain, or likely spoofing);
- a verdict on moving `p=none` → `quarantine` (pct ramp) → `reject`;
- CSV export.

```
node --test
```

Files: `analyze.mjs` (parser, summary, diagnosis, gzip/zip decoding),
`usage.mjs` (opt-out local counters).

Limits: zip files using a trailing data descriptor must be unzipped first;
forensic (ruf) reports are not read; no reverse-DNS or IP ownership lookup
(that needs the network); heuristics, not a guarantee that enforcing is safe.
Free and as-is, no warranty; not legal, tax, or financial advice.
