import { MarkdownViewer } from "@/components/MarkdownViewer";

const content = `# Operations Playbook

## Capture Workflow (Single Session)

### Pre-session

- [ ] Confirm artist agreement signed
- [ ] Inventory pieces to be captured (title, dimensions, medium, year)
- [ ] Confirm pieces are dry, dust-free, and positioned for photography
- [ ] Pack kit: camera, tripod, lights, gray card / color checker, measuring tape

### On-site

1. **Environment** — controlled lighting, minimal glare, neutral background or easel setup
2. **Per piece:**
   - Measure and record dimensions
   - Capture RAW + bracketed exposures if needed
   - Include color reference card in frame
   - Optional: process photos/video (time-lapse, detail shots, palette)
3. **Metadata** — artist name, title, medium, dimensions, date, location captured

### Post-session

1. Upload RAW/files to shared storage (Google Drive or equivalent) using naming convention:
   \`\`\`
   {city}/{artist-slug}/{date}/{piece-slug}/
     raw/
     edited/
     marketing/
     metadata.json
   \`\`\`
2. Color-correct and export print-ready masters (TIFF/PNG, appropriate DPI for target print sizes)
3. Generate proof print → artist approval
4. Create listing assets (cropped views, room mocks if available)
5. Publish to storefront

## Print-on-Demand Fulfillment (Phase 0–2)

Use a POD partner until volume and margins justify alternative fulfillment.

### Provider evaluation criteria

- Color accuracy and paper options (archival, cotton rag, etc.)
- Print size range
- Frame/mount options
- Shipping speed and international coverage
- API/integration for automation
- Base cost vs. retail price → gross margin

### Order flow (manual → automated)

1. Customer orders on storefront
2. Order routed to POD provider (manual at first, API later)
3. Provider prints, packs, ships
4. Tracking synced to customer
5. Sale recorded for artist revenue share calculation

## City Expansion Model

### Roles

| Role | Responsibility |
|------|----------------|
| **Acquisition lead** | Artist outreach, scheduling, relationship management |
| **Field photographer** | On-site capture per playbook |
| **Central ops** | Editing, cataloging, listing, fulfillment coordination |

### Launching a new city

1. Identify local art clusters (studios, schools, co-ops, fairs)
2. Recruit contract photographer — send gear checklist and training doc
3. Provide contract templates and pitch materials
4. Run 2-week acquisition sprint: target N artists, M pieces
5. Upload to central pipeline; central team processes within SLA (e.g. 5 business days)

### Field photographer kit (minimum)

- DSLR/mirrorless with RAW capability
- 50mm or appropriate lens (minimal distortion)
- Two adjustable lights + diffusers
- Tripod
- Color checker
- Tablet/phone for metadata entry
- Laminated quick-reference capture guide

### Compensation (TBD)

- Per-session fee, per-piece fee, or revenue share on that city's catalog
- Travel reimbursement policy

## Marketing Asset Pipeline

Process content captured during sessions feeds demand-side marketing:

- Instagram/TikTok: painting timelapses, studio visits
- Email: "Meet the artist" features
- Product pages: process gallery alongside print options
- Ads: story-led creative outperforms bare product shots

Store alongside print masters in \`{piece-slug}/marketing/\`.

## Quality Bar

A piece does **not** list until:

- [ ] Color-accurate master approved internally
- [ ] Proof print approved by artist (pilot phase) or internal QA (scale phase)
- [ ] Metadata complete
- [ ] Minimum 2 listing images (full piece + detail or room mock)

## Tooling Roadmap

| Phase | Tools |
|-------|-------|
| 0 | Google Drive, spreadsheet tracker, manual Shopify/manual orders |
| 1 | Notion/Airtable catalog, standardized metadata schema |
| 2 | Artist upload portal, automated POD routing, payout dashboard |
| 3 | Multi-city dispatch, inventory analytics, ad performance integration |
`;

export default function OperationsPage() {
  return <MarkdownViewer content={content} />;
}
