# SMS Segment Cost Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sms-segment-cost-calculator/>

After using this, you can see exactly why a text message bills as three
segments instead of one, which character caused it, and what fixing it saves per
month at your volume — which used to mean reading provider docs and counting
bytes by hand.

Open `index.html` (or the published page): paste a message, set your monthly
volume and per-segment price, and read the encoding (GSM-7 or UCS-2), segment
count, the offending characters, and a plain-character rewrite.

## Rules implemented (`engine.mjs`)

- GSM-7 (GSM 03.38 basic set): 160 characters in one segment, 153 per segment
  when split. `^ { } \ [ ] ~ | €` are extension characters and count as two.
- Any character outside GSM-7 makes the whole message UCS-2: 70 in one segment,
  67 per segment when split. Emoji count as two UTF-16 units.
- `toGsm7` swaps common look-alikes (curly quotes, en/em dash, ellipsis,
  non-breaking space) for plain equivalents and reports anything it cannot fix.

```
node --test engine.test.mjs page.test.mjs usage.test.mjs
```

## What it is not

Arithmetic on text and numbers you give it, at approximate list prices that are
editable. It is not a guarantee of any provider's invoice and not telecom
compliance advice. Consent and opt-out rules (TCPA, 10DLC) are yours.
Nothing is uploaded; there is no network call. MIT licensed.
