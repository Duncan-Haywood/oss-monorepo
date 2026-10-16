# Home Inspection Report Builder

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/home-inspection-report-builder/>

A free browser tool for working home inspectors. Pick findings from a library of
plain-language comments grouped by system (roof, exterior, structure, electrical,
plumbing, heating, cooling, interior, attic, garage), edit the wording, set
severity, add notes and your own repair cost ranges, and print a report sorted
safety-first. Save to a file on your own device and load it later. Entirely
client-side.

After using this, you can **hand a client a clear, severity-sorted report without
paying for report software**.

## Try it

Open [`index.html`](index.html), pick a system, click a comment to add it, then **Build the report**.

## Limits

The library is generic starting text. It cites no code or standard of practice,
and the inspector owns every statement. No photos, scheduling or agreements.
Nothing is stored by the page; use Save to a file.

## Tests

`node --test`
