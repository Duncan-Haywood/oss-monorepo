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

## Next

1. **Test with the designer who asked for it.** Their artwork and a real quote from a manufacturer through the studio; fold what breaks into the command vocabulary (`commands.test.mjs` gets each real sentence as a case) and the costing.
2. **Real painting workflow.** Crop, mask and colour-reduce an uploaded painting for screen print (n-colour quantisation with a separation preview), and a raised-outline layer generated from the image edges for high-density ink, so "3D paintings" become a printable separation, not just a preview.
3. **3D preview.** A WebGL garment with the artwork mapped on, then WebXR so the same scene opens in a VR headset with voice commands, as the interview asked.
4. **Manufacturer directory as data.** Fabric and method offers per manufacturer from their published catalogues (with source links and dates), so a designer can compare who can make a design and at what MOQ before asking for quotes.
5. **Store.** A self-deployable storefront (static site plus the deployer's own payment keys, off by default) generated from the launch kit; later a multi-brand marketplace with a commission setting, as the interview suggested.
6. **Marketing.** A content calendar and ad-budget planner from the break-even (how many sales the launch budget must buy), drafts only, never auto-posting.

## Not planned

- Sewing patterns and grading: professional pattern software does this well.
- Holding anyone's designs on our servers.
