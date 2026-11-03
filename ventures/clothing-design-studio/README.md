# Clothing Design Studio

**Say what you want on the shirt. See it, change it, know what it costs.**
A free, open-source (MIT) browser studio for independent clothing designers:
design a tee, long-sleeve, sweatshirt or hoodie by talking, typing or dragging,
compare three versions, cost every piece from your manufacturer's prices, and
download a tech pack and quote request to send them.

Live: https://marisstella.app/clothing-design-studio/

## Why someone would use it

A designer starting a line has three jobs before the first order: decide what
the garment looks like, find out what it costs to make and sell, and tell a
factory exactly what to make. Today that is usually three tools:

| Today | What it does well | What it leaves out |
|---|---|---|
| Professional 3D garment suites (CLO 3D, Browzwear) | Patterns, grading, fit on an avatar | Paid, and more than a graphic-led line needs; no costing or launch |
| Print-on-demand mockup makers (Printful, Printify) | Mockups on their own blanks, they print and ship | Their prices and blanks, not your manufacturer's; no tech pack |
| Graphic tools (Canva, Kittl) plus a spreadsheet | Artwork | No garment, fabric, method or cost model |

This studio does the part between: a designer who is not a pattern-maker or a
spreadsheet person can say "make it cream, add a halo, embroider it in 3D" and
see it, know the landed cost and break-even from their own supplier's quote,
and send a tech pack. Free, nothing uploaded. (Products named only to describe
what this tool is and is not; not affiliated with, endorsed or sponsored by
any of them. Names are trademarks of their owners.)

## Run it

It is a static page with ES modules and no build step:

```
cd ventures/clothing-design-studio
python3 -m http.server 8000      # then open http://localhost:8000
node --test *.test.mjs           # tests
```

## Optional AI

The command box needs no AI. To understand freer speech, pick a provider in
the page's last section: your own Anthropic, OpenAI or Gemini key, or a model
running on your own computer (Ollama, LM Studio, llama.cpp). The model only
rewrites what you said into the studio's own commands, which then go through
the same parser and rules (`ai.mjs`), so it cannot do anything a typed command
could not. The key stays in your browser unless you tick "remember", and then
only in this browser's local storage. `byok.mjs` is a synced copy of
`platform/llm/byok.mjs`; a test fails if they drift.

## Files

| File | What |
|---|---|
| `catalogue.mjs` | Garments (to scale), print areas, fabrics, methods, colours, compatibility notes |
| `design.mjs` | The design model, every edit as an operation, undo, three variants, share links |
| `commands.mjs` | Spoken or typed sentences to operations, no model |
| `ai.mjs` | Optional model that rewrites free speech into commands |
| `render.mjs`, `motifs.mjs` | SVG drawing; original motifs; public-domain image sources |
| `suppliers.mjs` | Supplier sheet, CSV in and out, example placeholder sheet |
| `costing.mjs` | Landed cost, margin, break-even, target price, quantity breaks |
| `techpack.mjs` | Tech pack and quote request |
| `launchkit.mjs` | Description, captions, hashtags, store CSV |
| `eyewear.mjs`, `sunglasses.html` | Sunglasses: stock frame, size, logos, case, cost, quote request |
| `wardrobe.mjs`, `wardrobe.html` | Capsule wardrobe from a profile, outfit count, first drop within a budget |
| `usage.mjs` | Anonymous local usage counts |

Roadmap: [`ROADMAP.md`](ROADMAP.md).

## Privacy

Everything runs in your browser. Designs, images and prices are saved in this
browser's local storage and never uploaded; there are no accounts, tracking
cookies or analytics vendor. Speaking uses the browser's own speech
recognition, which in Chrome and Edge sends audio to the browser maker (the
page asks first). With an AI provider chosen, your command text and a
one-line summary of the design go to that provider. Anonymous counts of which
features are used stay in your browser and can be turned off.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, manufacturing or
intellectual-property advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, including the rights to any artwork you use, and for
meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your inputs
and run it yourself.

MIT licence: [`LICENSE`](LICENSE). Sponsor: https://github.com/sponsors/Duncan-Haywood
