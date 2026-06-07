import { MarkdownViewer } from "@/components/MarkdownViewer";

const content = `# Artist Pitch

## One-Liner

*We photograph your finished work, sell museum-quality prints online, and send you 30% of the profits — you keep painting.*

## The Conversation

### Their reality

You finish a piece. It sells once — maybe. Or it sits in the studio. Either way, the hours you put in don't keep paying you.

### Our offer

1. **We come to you** (or you come to a local capture session) with professional photo gear and lighting
2. **We digitize** the painting — color-accurate, print-ready master file
3. **We list and sell** prints through our store and channels
4. **We fulfill** — print, pack, ship via our fulfillment partner. You touch nothing.
5. **You earn** 30% of net profit on every print sold

### Materials support (optional)

If covering canvas, paint, or supplies is a barrier, we add **up to 30% materials reimbursement** on top of the profit share. Terms defined per agreement.

## What We Need From the Artist

- Finished, dry, framable-or-flat work ready for photography
- Permission to sell prints of the digitized image (scope defined in contract)
- Optional: permission to use process photos/video for marketing
- Bank details or preferred payout method for revenue share

## What the Artist Keeps

- The original painting — always
- Credit and attribution on all listings
- Right to sell the original independently
- Transparency on sales (periodic statements or portal, TBD)

## What We Handle

- Photography and color correction
- Listing copy, SEO, and storefront presentation
- Print production and shipping
- Customer service on fulfillment issues
- Marketing and advertising investment (at scale)

## Objection Handling

| Objection | Response |
|-----------|----------|
| "I already sell prints myself" | Great — we expand your reach without replacing your direct sales. Non-exclusive options available. |
| "Will the prints look good?" | We use calibrated capture and premium POD partners; you approve a proof before listing. |
| "30% sounds low" | Compare to a gallery taking 50% on one original sale. This is 30% on *every* print, forever, with zero labor from you. |
| "I don't want my work everywhere" | Contract defines channels and edition limits. Limited editions available. |
| "What if it doesn't sell?" | Zero cost to you. Worst case: you have a professional archival scan of your work. |

## Pilot Ask (Phase 0)

We're starting with a small group of local artists to prove quality and economics. Pilot artists get:

- Priority placement in the founding catalog
- Input on proofing and paper options
- Founding-artist badge/story on the storefront

**Ask:** 3–5 finished pieces for capture session. 30 minutes for paperwork. Optional process shoot.

## Contract Outline (Draft — Not Legal Advice)

1. **Grant of license** — non-exclusive (or exclusive, TBD) print reproduction rights for specified works
2. **Revenue share** — 30% of net profit per sale; definition of "net" documented
3. **Materials clause** — optional 30% reimbursement with cap and approval process
4. **Attribution** — artist name prominently on all listings
5. **Term & termination** — duration, notice period, what happens to listed inventory
6. **Quality approval** — artist sign-off on proof print before public listing
7. **Original ownership** — explicitly retained by artist

> **Note:** Final agreements require review by a qualified attorney before use.
`;

export default function ArtistPitchPage() {
  return <MarkdownViewer content={content} />;
}
