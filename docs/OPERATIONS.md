# Operations Playbook (Software & AI First)

## The AI Capture & Processing Pipeline

We eliminate the need for manual field photography by leveraging AI to process artist-submitted photos.

### 1. Artist Upload (Self-Serve)

- **Input:** Artist uploads a photo of their painting taken with a modern smartphone (iPhone 12+, Pixel 5+, etc.).
- **Guidelines:** We provide a simple, digital guide (e.g., "Take photo in indirect natural light, keep phone parallel to canvas").
- **Metadata:** Artist inputs title, dimensions, medium, and year via the web portal.

### 2. AI Processing Engine (Automated)

- **Perspective Correction:** Auto-detect canvas edges and correct skew/keystoning.
- **Lighting Normalization:** AI removes glare, evens out lighting gradients, and neutralizes color casts.
- **Upscaling & Enhancement:** Use advanced AI models (e.g., Topaz Gigapixel, custom Stable Diffusion pipelines) to upscale the image to 300 DPI at large print sizes while preserving authentic brushstrokes and texture.
- **Color Grading:** Automated color correction to match standard print profiles (CMYK conversion).

### 3. Automated Merchandising

- **Room Mockups:** AI generates photorealistic lifestyle images of the art in various settings (modern living room, minimalist office, etc.).
- **Detail Shots:** AI generates simulated macro shots highlighting texture.
- **Listing Copy:** LLMs generate SEO-optimized product descriptions based on the artist's metadata and visual analysis of the piece.

### 4. Publishing & Sync

- Processed assets and metadata are automatically pushed to our commerce backend (e.g., Shopify API).
- Products are instantly available for purchase.

## Print-on-Demand Fulfillment (API Driven)

We operate with zero inventory, relying entirely on API-integrated POD partners.

### Provider Criteria

- **API Robustness:** Must support fully automated order routing, variant mapping, and tracking sync.
- **Quality:** Archival inks, museum-quality cotton rag paper options.
- **Global Network:** Ability to route orders to facilities near the customer to reduce shipping costs and times.

### Order Flow (Zero Touch)

1. Customer orders on storefront.
2. Webhook triggers order routing to the optimal POD facility via API.
3. Provider prints, packs, and ships.
4. Tracking is automatically synced back to the storefront and customer.
5. Sale is recorded in our database, and the artist's revenue share is credited to their dashboard.

## Digital-First Sales Outreach

Instead of manual city-by-city expansion, we scale globally from day one using software.

### B2B / Trade Outreach (Automated)

- **Targeting:** Scrape directories and social media for interior designers, boutique hotels, and architects.
- **Campaigns:** Automated, personalized email sequences offering trade discounts and curated collections.
- **Fulfillment:** Trade portal for bulk ordering with automated invoicing.

### Artist Acquisition (Automated)

- **Targeting:** Identify emerging artists on Instagram, TikTok, and portfolio sites using computer vision and hashtag analysis.
- **Outreach:** AI-drafted personalized DMs and emails pitching the platform. "We saw your piece [Title], it would look amazing as a print. Upload a photo and we'll handle the rest."

## Tooling & Architecture Roadmap

| Phase | Focus | Technologies |
|-------|-------|--------------|
| **0 — Prototype** | Validate AI upscaling and POD API | Python, OpenCV, Topaz/Stable Diffusion APIs, Printful/Prodigi API |
| **1 — MVP Platform** | Artist upload portal, basic processing pipeline, Shopify integration | Next.js, Vercel, AWS S3, Shopify API |
| **2 — Automation** | Automated merchandising (mockups, copy), automated outreach | Midjourney API, OpenAI API, Apollo.io / Instantly |
| **3 — Scale** | Custom AI models trained specifically on fine art textures, global POD routing engine | Custom PyTorch models, advanced workflow orchestration |
