# ShootFlow Product Strategy

## Product thesis

Photographers and videographers do not primarily need another editor. They need a high-trust production assistant that turns a messy shoot dump into organized media, color-consistent selects, and ready-to-post Instagram outputs with far less project management.

ShootFlow should become a local-first Mac and iPhone workflow for:

- ingesting camera cards, SSDs, phones, and archives without destructive side effects;
- organizing raw, log, JPEG, audio, and rendered intermediates into predictable shoot folders;
- generating high-quality color grades and edit suggestions using VLMs and deterministic render pipelines;
- producing reels, carousels, and photo sets that are easy to review, revise, and publish.

## Primary audience

1. **Working photographers** who shoot high volume and need faster social delivery.
2. **Solo videographers** who want cinematic reels without spending hours triaging log footage.
3. **Creators with paid editors** who want better throughput, fewer handoff mistakes, and more content per editing dollar.
4. **Small studios** that need consistent organization and repeatable Instagram packaging across shoots.

## Differentiation

ShootFlow should compete on workflow leverage rather than filters:

- **File safety first:** never delete sources, never overwrite different bytes, and record every ingest decision in a manifest.
- **Bulk-first architecture:** every asset-level task is independently schedulable so 10,000+ photos/videos can run across CPU, GPU, local workers, and cloud workers later.
- **Cinematic consistency:** develop a shoot-level look from scene analysis before rendering per-asset grades.
- **Reviewable automation:** produce intermediate graded masters, storyline JSON, and edit plans, not just final social exports.
- **Local trust:** keep originals on the user's storage by default, with explicit opt-in for remote compute.

## Product wedge

The first strong wedge is "dump a card, get organized selects and IG drafts." The earliest useful workflow:

1. Detect connected drives and identify likely camera cards versus storage SSDs.
2. Copy supported media into a safe local or SSD shoot folder.
3. Verify every copied file with SHA-256 and write a manifest.
4. Rank assets and create draft Instagram reel, carousel, and photo-set plans.
5. Leave originals untouched and make every destructive operation unavailable by default.

## Business model hypotheses

- **Personal/pro:** paid Mac app with a generous local-only trial and a pro tier for batch throughput, custom looks, and template exports.
- **Studio:** seats plus shared look libraries, editor handoff packages, and team presets.
- **Compute add-on:** optional cloud acceleration for proxy generation, VLM analysis, and render queues. This should be opt-in because media privacy and upload costs matter.

## Quality bar

The product is only viable if it feels safer than Finder drag-and-drop and more dependable than ad hoc editor handoffs. Speed matters, but trust comes first:

- clear preflight summaries before ingest;
- manifests and copy verification for every import;
- no automatic deletion of source media in early releases;
- deterministic job plans that can be regenerated;
- failure states that are recoverable and understandable.

## Near-term roadmap

1. Manifest-backed ingest and storage ranking.
2. Production asset catalog that only trusts verified manifest items.
3. Proxy, VLM analysis, look-development, grade, storyline, and delivery job graph.
4. Review UI for selects, reels, carousels, and rejected assets.
5. Mac drive detection and background workers.
6. iPhone companion for shoot review, quick approvals, and mobile capture import.
