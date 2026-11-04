# Clothing Design Studio: roadmap

The studio is the first slice of an owner request (R-0005 in
`portfolio/requests/requests.json`): AI-assisted clothing design where the
software handles as much as possible of the rest (manufacturing, store,
marketing, distribution) and the designer works by voice and by hand. It is a
many-session project. Each milestone below lands as a working slice.

## Done (2026-11-03, v0)

- Garments (tee, long-sleeve, crewneck, hoodie) drawn to size-M scale, front and back, with print areas.
- Commands by voice (browser speech, opt-in) or typing, deterministic parser, every change listed with its words and undoable; optional own-key or local model that rewrites free speech into the same commands.
- Drag, resize, rotate, keyboard nudges; motifs, text and uploaded images.
- Nine fabrics, eight decoration methods (three raised), compatibility notes.
- Three alternatives and "go with the second one".
- Costing from a supplier sheet (CSV in and out): landed cost, margin after VAT and fees, break-even, cash up front, price for a target margin, quantity breaks.
- Tech pack (printable, JSON) and quote request; launch kit (description, captions, hashtags, store CSV).

- Sunglasses designer (second interview): stock frame styles, 52□18-145 sizing with range checks, logos on temple, lens, case and cloth, landed cost, quote request with EN ISO 12312-1 and FDA drop-ball asks.
- Wardrobe planner (second interview): capsule from age band, fit, style, climate, season, occasions and quality tier; outfit count by a stated colour rule; in-house vs partner-brand pieces; first drop within a budget, most-worn pieces first.

## Next

1. **Test with the designer who asked for it.** Their artwork and a real quote from a manufacturer through the studio; fold what breaks into the command vocabulary (`commands.test.mjs` gets each real sentence as a case) and the costing.
2. **Real painting workflow (first slice done 2026-11-03: `separation.mjs`, n-colour Lab k-means, screen count, thin-line warnings, raised-outline layer, films; `inktradeoff.mjs` 2026-11-04: separates at 2 to 8 inks, prices each on the supplier sheet and reports flat-colour distance (mean delta E) with the fewest inks past which one more buys under 1 delta E; still to do: crop and mask, halftone, a real painting through a real printer).** Crop, mask and colour-reduce an uploaded painting for screen print (n-colour quantisation with a separation preview), and a raised-outline layer generated from the image edges for high-density ink, so "3D paintings" become a printable separation, not just a preview.
3. **3D preview and try-on.** (First slice done 2026-11-04: `turntable.mjs`, a "Turn the garment" slider and spin on the studio page; the front or back drawing squeezed by cos(angle) and shaded, so artwork can be checked as the garment turns. An approximation with no drape, seams or sleeves, not a fit check. Second slice done 2026-11-04: `garment3d.mjs` + `viewer3d.mjs`, a real WebGL solid with the front and back artwork mapped on and drag-to-orbit; a rounded solid, not cloth. Third slice done 2026-11-04: `fit.mjs` + `fit.html`, size from chest/waist/hip/height with ease in every size and a size run from the audience chest curve; typical chart, tape arithmetic only. Still to do: body model, WebXR, try-on, a real factory chart through it.) A WebGL garment with the artwork mapped on, then WebXR so the same scene opens in a VR headset with voice commands; and a try-on on the shopper (their measurements on a body model first, a camera-based AR view later, on device), as both interviews asked.
4. **Manufacturer directory as data.** (First slice done 2026-11-04: `quotes.mjs` + `quotes.html`, the designer's own factory quotes as sheets, one design costed on all of them with the cheapest factory by run size; MOQ and currency guards. Still to do: a published-catalogue directory with source links, a real designer's set of quotes.) Fabric and method offers per manufacturer from their published catalogues (with source links and dates), so a designer can compare who can make a design and at what MOQ before asking for quotes.
5. **Store.** (First slice done 2026-11-04: `storefront.mjs`, one static HTML shop file from the design: front and back drawings, size picker, schema.org Product data, order-by-email by default, the deployer's own https payment link as Buy button, shipping and returns text only if typed. Also done 2026-11-04: `shelf.mjs`, several designs on a shelf kept in the browser, one payment link per product, one shop file. Still to do: a real deploy by a real designer, cart.) A self-deployable storefront; later a multi-brand marketplace with a commission setting, as the interview suggested.
6. **Wardrobe as a service.** (First slice done 2026-11-04: `lookbook.mjs`, one static page with every outfit drawn as flat silhouettes and a download button on the wardrobe page; optional https links per piece. Also done 2026-11-04: `guide.mjs`, a sentence typed or dictated fills the wardrobe questions, shows the words behind each answer and asks what is missing; keyword rules, English only. Still to do: a back-and-forth chat and a real designer's wording.) A short guided conversation (voice or chat) that fills the wardrobe profile, then a lookbook page per wardrobe with each outfit drawn, linking each piece to the brand's own product or a partner's.
7. **Marketing.** (First slice done 2026-11-04: `marketing.mjs`, break-even cost per sale and ROAS, ad sales the budget buys, a week-by-week calendar with sales and spend targets that sum to the break-even and the budget, CSV. Also done 2026-11-04: `learnFromTest`, a first small ad test read with a Wilson 95% range and a go/stop/unclear verdict that feeds the plan. Still to do: per-channel splits; a real designer's test.) A content calendar and ad-budget planner from the break-even (how many sales the launch budget must buy), drafts only, never auto-posting.

8. **Compliance labels.** (First slice done 2026-11-04: `labels.mjs` + `labels.html`, fibre content and care for the EU and US; rules summarised, not legal advice. Still to do: UK and Canada, wool/fur/leather special rules, a real factory's label through it.)

## Not planned

- Sewing patterns and grading: professional pattern software does this well.
- Holding anyone's designs on our servers.
