# Operations Playbook

## App-Based Capture Workflow (Software-First)

The core operational bottleneck of traditional art digitization (professional photographers, lighting setups, physical travel) is eliminated by our AI-powered mobile app.

### Artist Experience

1. **Onboarding:** Artist downloads the Print Atelier app and completes KYC/payout setup.
2. **Capture:** 
   - App guides the artist to place the artwork in even, natural light.
   - App uses AR to ensure the phone is perfectly parallel to the canvas.
   - Artist takes multiple overlapping photos (guided by the app) for high-resolution stitching, plus one shot with our standard color-calibration card (mailed to them upon signup, or using a standard household item reference).
3. **Processing (Cloud):**
   - **Glare Removal:** AI identifies and removes specular highlights from wet paint or varnish.
   - **Perspective & Stitching:** Images are flattened and stitched into a massive composite.
   - **Color Correction:** AI calibrates the image against the reference card.
   - **Upscaling:** Super-resolution models upscale the image to support large-format prints (e.g., 40x60 inches) without pixelation.
4. **Approval:** Artist reviews the digital proof in the app and taps "Publish".

### Central Ops (Automated)

1. **Asset Generation:** System automatically generates cropped views, detail shots, and AI interior design mockups.
2. **Metadata & SEO:** Vision AI tags the image (e.g., "abstract", "blue", "impasto", "coastal") and generates SEO-optimized titles and descriptions.
3. **Syndication:** The piece is pushed to the Print Atelier storefront and API-connected marketplaces.

## Print-on-Demand Fulfillment (API-Driven)

We operate with zero physical inventory. All fulfillment is routed programmatically.

### Provider Integration

- **Primary Partner:** Global POD provider (e.g., Prodigi, Gelato) integrated via API.
- **Routing Logic:** Software automatically routes the order to the print facility geographically closest to the buyer to minimize shipping costs and carbon footprint.

### Order Flow (Zero-Touch)

1. Customer orders on storefront.
2. Webhook triggers order creation in Print Atelier backend.
3. API pushes order details and print-ready master URL to the optimal POD facility.
4. Provider prints, packs, and ships (white-labeled).
5. Tracking number is posted back via API and emailed to the customer.
6. Ledger updates automatically: Artist's balance increases, Print Atelier's margin is recorded.

## Marketing Asset Pipeline (AI-Generated)

We do not rely on artists to provide high-quality lifestyle marketing content.

- **Room Mockups:** Our AI places the artwork into diverse, hyper-realistic interior settings (Mid-Century Modern, Minimalist, Industrial) to appeal to different buyer aesthetics.
- **Social Content:** Automated generation of Instagram Reels/TikToks using the Ken Burns effect (panning across the high-res details of the artwork) paired with trending audio.
- **Dynamic Ads:** Meta/Google ads automatically assemble using the AI mockups and performance data.

## Quality Assurance (Human-in-the-Loop)

While software handles 99% of the process, quality is maintained via targeted human review:

- **Flagged Scans:** If the AI confidence score for color accuracy or sharpness is below a threshold, the scan is flagged for manual review by a digital retoucher.
- **Test Prints:** For an artist's first submission, a small physical proof is automatically ordered and sent to HQ to verify the app's calibration for that specific artist's medium.

## Tooling & Infrastructure

| Layer | Technology Stack |
|-------|------------------|
| **Mobile App** | React Native / Swift, CoreML/ARKit for capture guidance |
| **AI Pipeline** | Python, OpenCV, Custom PyTorch models (stitching, upscaling) |
| **Backend** | Node.js / Python, PostgreSQL, Stripe Connect (payouts) |
| **Commerce** | Headless Shopify or custom Next.js storefront |
| **Fulfillment** | Gelato / Prodigi API |
