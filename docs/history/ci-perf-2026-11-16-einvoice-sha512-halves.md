# einvoice-preflight: SHA-512 on 32-bit halves, not BigInt words (2026-11-16)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner. `venture_suite_times.json` (2026-11-16 03:01Z)
ranks league, shift-roster and shed first; each had perf work in the last two
days or has a perf PR open (#16481), so this run went down the list to the
~40 s suites: einvoice-preflight, open-house-plans, wall-framing-takeoff.

## Reading

- `run_venture_tests.py --jobs 1 <slug>`, one suite at a time on 4 cores:
  einvoice-preflight 15 s, open-house-plans 23 s, wall-framing-takeoff 23 s,
  ai-bookkeeper 31 s.
- einvoice-preflight, each test file timed alone (4 in parallel): the slowest
  were `facturae-signature.test.mjs` **3.2 s** and `zatca-stamp.test.mjs` 2.0 s;
  the rest under 1.2 s, mostly Node start-up.
- `node --cpu-prof facturae-signature.test.mjs`, self time: `sha512core` 853 ms,
  its `ror` closure 764 ms, `sha512` 167 ms: **1.8 s of a 2.6 s profile** in the
  SHA-512 the XAdES checker uses for digests. It worked on BigInt words
  ("slow but small inputs", its comment said). One test, which checks 113
  mangled signed files, spent 1,294 to 1,435 ms (three runs): about **12 ms
  per signed-file check**.

The checker is product code: `index.html` imports `report.mjs`, which runs
`checkFacturaeSignature` on a dropped Facturae file in the visitor's browser.

## Change

- `xmldsig.mjs`: `sha512core` keeps each 64-bit word as two 32-bit halves in
  an `Int32Array` (the usual non-BigInt SHA-512), with carries summed in
  doubles (at most five uint32 terms, exact). Same interface, same bytes.
- `zatca-stamp.mjs`: `mod` takes one BigInt division instead of two
  (`r = a % m; r < 0n ? r + m : r`).

## Verification

- A scratch script hashed random inputs of every length 0 to 600 bytes plus
  4,096, 40,892 and 100,003 bytes, three draws each, with SHA-512 and
  SHA-384: **3,624 digests equal to `node:crypto`** and, under 3,000 bytes, to
  the old BigInt version; strings with non-ASCII text too. The suite's own test
  "SHA-1, SHA-384, SHA-512 and RSA verification agree with node:crypto" passes.
- `mod`: 200,000 random 512-bit values, positive, negative and multiples of
  P, identical to the old formula.
- `python3 platform/ci/run_venture_tests.py einvoice-preflight`: ok, 2,570
  tests, 0 failed.

## After

| measure | before | after |
| --- | --- | --- |
| SHA-512 of 40,892 bytes (warm, mean of 20) | 24.56 ms | 1.78 ms |
| "mangling any signature field" test (113 checks), 3 runs | 1,295 to 1,435 ms | 173 to 206 ms |
| per signed-file check | ~12 ms | ~1.7 ms |
| `facturae-signature.test.mjs` wall, 3 runs | 2.57 to 2.74 s | 0.96 to 1.09 s |
| `zatca-stamp.test.mjs` wall, 3 runs | 1.99 to 2.17 s | 1.66 to 2.02 s |

The suite as a whole saves under 2 s of CPU: most of its 15 s is starting
Node for ~250 test files.

## Not changed (ranked, for the next run)

1. `zatca-stamp.mjs` secp256k1: `mod` is still 400 ms self in its test, the
   BigInt `%` of 512-bit products. A reduction specialised to
   P = 2^256 - 2^32 - 977 (fold the high half times 2^32 + 977) would cut it,
   but one ECDSA verify per visitor file is already a few ms. Low value.
2. einvoice-preflight's 250 test files each pay Node start-up (~60 to 100 ms).
   Fewer, larger files would save several seconds of CPU, but a file per
   mandate page is how the venture is organised; not worth the churn.
3. open-house-plans and wall-framing-takeoff (23 s each alone) were not
   profiled this run; both had perf passes on 2026-11-13.
