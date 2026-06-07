import React from 'react';

export const BusinessPlan: React.FC = () => {
  return (
    <div className="prose max-w-none">
      <h1>Print Atelier: Business Plan</h1>

      <h2>1. Executive Summary</h2>
      <p>
        Print Atelier is an AI-first, software-driven platform that bridges the gap between traditional fine art and scalable e-commerce. We photograph original paintings, sell museum-quality prints online, and pay artists 30% of the net profits. By sitting between artists and buyers, we provide a <strong>digitization + distribution layer</strong> that frees artists from the burden of logistics while creating a scalable, high-margin catalog of fine art.
      </p>
      <p>
        Unlike traditional galleries or manual agencies, Print Atelier is built from day one as a <strong>software-first, AI-first, and digital-first</strong> business. By leveraging automation for outreach, AI for asset generation and curation, and software for seamless payouts, we can scale globally without linear headcount growth.
      </p>

      <hr />

      <h2>2. Core Vision: Software & AI First</h2>
      <p>
        To scale the acquisition of art (supply) and the sale of prints (demand), Print Atelier operates as a technology company rather than a traditional art dealer.
      </p>

      <h3>Software-First Operations</h3>
      <ul>
        <li><strong>Automated Payouts & Transparency:</strong> Smart contracts and automated ledgers (e.g., Stripe Connect) to instantly route the 30% revenue share to artists upon delivery.</li>
        <li><strong>Centralized Asset Management:</strong> A scalable cataloging system that automatically routes orders to global Print-On-Demand (POD) partners based on the buyer's location.</li>
        <li><strong>Artist Portal:</strong> A self-serve dashboard where artists can track sales, view earnings, and upload their own high-res scans if they have the equipment.</li>
      </ul>

      <h3>AI-First Asset & Marketing Engine</h3>
      <ul>
        <li><strong>Asset Enhancement:</strong> AI upscaling and automated color correction to ensure uniform quality across the catalog, reducing manual editing time.</li>
        <li><strong>Dynamic Room Mockups:</strong> AI-generated environmental mockups (living rooms, galleries, cafes) to showcase art in context without expensive photoshoots.</li>
        <li><strong>Content Generation:</strong> AI-driven copywriting for product descriptions, artist bios, and SEO-optimized blog posts based on raw interview transcripts with the artists.</li>
        <li><strong>Predictive Merchandising:</strong> Machine learning to identify trending color palettes, styles, and sizes to inform which pieces to promote.</li>
      </ul>

      <h3>Digital-First Sales Outreach</h3>
      <ul>
        <li><strong>Automated Artist Acquisition:</strong> Scraping Instagram, TikTok, and portfolio sites to identify emerging artists, followed by personalized, AI-crafted email/DM sequences to pitch the Print Atelier partnership.</li>
        <li><strong>Programmatic Ad Buying:</strong> AI-managed ad spend across Meta, Pinterest, and Google, optimizing for ROAS (Return on Ad Spend) on the demand side.</li>
      </ul>

      <hr />

      <h2>3. Market Research & Competitive Landscape</h2>

      <h3>The Opportunity</h3>
      <p>
        The global online art market is growing rapidly, driven by millennials and Gen Z buying art for their homes, as well as interior designers sourcing for commercial spaces. The market is highly fragmented:
      </p>
      <ul>
        <li>High-end galleries are inaccessible to most buyers and take 50% cuts from artists.</li>
        <li>Mass-market platforms (Society6, Redbubble) treat art as a commodity, yielding pennies for artists and offering low-quality prints.</li>
        <li>Direct-to-consumer (D2C) artists struggle with the logistics of marketing, printing, and shipping.</li>
      </ul>
      <p>
        The global online fine art market is projected to grow from ~$14.1B in 2026 to ~$19B by 2031. The broader wall art and canvas print segment is estimated at ~$69B in 2026, tracking toward $102B by 2035.
      </p>

      <h3>Target Audience</h3>
      <ul>
        <li><strong>Supply:</strong> Mid-tier and emerging traditional painters who lack the time or capital to set up their own print logistics.</li>
        <li><strong>Demand:</strong> Homeowners, young professionals, and interior decorators looking for curated, museum-quality art at an accessible price point ($50 - $250).</li>
      </ul>

      <h3>Competitive Advantage</h3>
      <ul>
        <li><strong>Curated Quality:</strong> A higher bar than open marketplaces, maintaining brand prestige.</li>
        <li><strong>Artist-Friendly:</strong> Transparent 30% net profit share + optional materials reimbursement.</li>
        <li><strong>Frictionless:</strong> Artists do literally zero work after the scan.</li>
        <li><strong>Tech-Enabled Unit Economics:</strong> AI and automation keep operational costs near zero per incremental SKU.</li>
      </ul>

      <hr />

      <h2>4. Marketing & Sales (Two-Sided Engine)</h2>
      <p>
        Print Atelier operates a two-sided marketplace requiring digital-first outreach on both supply (artists) and demand (buyers).
      </p>

      <h3>Supply Side (Artists)</h3>
      <ul>
        <li><strong>Digital Outreach:</strong> Use AI agents to identify painters on social media whose style fits our curation. Automate initial outreach with personalized messaging ("We loved your recent landscape series...").</li>
        <li><strong>Frictionless Onboarding:</strong> Digital contracting (eSignatures) and localized photographer dispatch or mail-in scanner kits.</li>
        <li><strong>Retention:</strong> Monthly automated payout reports and a dashboard that makes passive income visible and addictive.</li>
      </ul>

      <h3>Demand Side (Print Buyers)</h3>
      <ul>
        <li><strong>Performance Marketing:</strong> Paid social campaigns (Meta, TikTok) utilizing behind-the-scenes process videos (e.g., timelapses of the artist working) paired with the finished print.</li>
        <li><strong>Personalized Nurture:</strong> Email and SMS sequences driven by user browsing behavior, leveraging AI to curate follow-up recommendations.</li>
        <li><strong>SEO & Storytelling:</strong> Auto-generated artist stories and process content that rank highly and build emotional connection with buyers.</li>
      </ul>

      <hr />

      <h2>5. Go-To-Market (GTM) Strategy</h2>

      <h3>Phase 1: Local Pilot & Validation (Months 1-3)</h3>
      <ul>
        <li><strong>Goal:</strong> Prove unit economics and quality.</li>
        <li><strong>Action:</strong> Manually onboard 5-10 local artists. Digitize 50 pieces.</li>
        <li><strong>Tech:</strong> Basic Shopify storefront, manual POD routing, manual payout calculation.</li>
        <li><strong>Marketing:</strong> Organic social media and small-budget Meta ads.</li>
      </ul>

      <h3>Phase 2: Software Platform Launch (Months 4-9)</h3>
      <ul>
        <li><strong>Goal:</strong> Automate the core loop.</li>
        <li><strong>Action:</strong> Build the Artist Portal and Automated Payout engine. Integrate POD APIs (e.g., Printful, Gelato) for hands-off fulfillment.</li>
        <li><strong>Tech:</strong> Launch the AI mockup generator and automated listing creator.</li>
        <li><strong>Marketing:</strong> Turn on automated digital outreach for artist acquisition across the US. Scale paid acquisition for buyers based on Phase 1 data.</li>
      </ul>

      <h3>Phase 3: Scale & Geographic Expansion (Months 10+)</h3>
      <ul>
        <li><strong>Goal:</strong> Dominate the mid-market print space.</li>
        <li><strong>Action:</strong> Launch the "City Expansion Model" utilizing local freelance photographers matched to artists via our software platform (an "Uber for art digitization").</li>
        <li><strong>Tech:</strong> Predictive merchandising and full AI marketing automation.</li>
        <li><strong>Marketing:</strong> B2B outreach (interior designers, hotels, corporate offices) for bulk orders.</li>
      </ul>

      <hr />

      <h2>6. Profitability Analysis</h2>

      <h3>Unit Economics (Per Print)</h3>
      <ul>
        <li><strong>Average Order Value (AOV):</strong> $85.00</li>
        <li><strong>COGS (Print + Shipping):</strong> $28.00 (33%)</li>
        <li><strong>Payment Processing:</strong> $2.55 (3%)</li>
        <li><strong>Net Profit Pool:</strong> $54.45 (64%)</li>
        <li><strong>Artist Share (30% of Net):</strong> $16.34</li>
        <li><strong>Print Atelier Gross Margin:</strong> $38.11 (45% of AOV)</li>
      </ul>

      <h3>Customer Acquisition Cost (CAC) & LTV</h3>
      <ul>
        <li><strong>Target CAC:</strong> &lt; $15.00 per customer.</li>
        <li><strong>Target LTV:</strong> &gt; $120.00 (Assuming 1.5 purchases per customer in year 1).</li>
        <li><strong>LTV:CAC Ratio:</strong> Targeting &gt; 3:1 to ensure scalable, profitable ad spend. Ad spend is unlocked dynamically when organic conversion rates on specific SKUs validate demand.</li>
      </ul>

      <h3>Fixed vs. Variable Costs</h3>
      <ul>
        <li><strong>Variable (Scalable):</strong> POD fulfillment, shipping, artist payouts, ad spend.</li>
        <li><strong>Fixed (Leveraged):</strong> Software development, AI API costs (OpenAI, Midjourney/Stable Diffusion), core team salaries.</li>
        <li><em>Note: Because software handles cataloging and fulfillment, fixed costs remain relatively flat as revenue scales exponentially.</em></li>
      </ul>

      <h3>Break-Even Milestones</h3>
      <ol>
        <li><strong>Pilot Break-Even:</strong> Covering the cost of the initial camera/lighting gear ($3,000) requires selling ~80 prints.</li>
        <li><strong>Platform Break-Even:</strong> Covering monthly SaaS and server costs requires a catalog of ~500 active SKUs generating ~200 sales/month.</li>
      </ol>

      <hr />

      <h2>7. Next Steps</h2>
      <ol>
        <li>Finalize POD partner selection based on API capability and print quality.</li>
        <li>Build the MVP Artist Portal (React/Next.js + Stripe Connect).</li>
        <li>Execute the Phase 1 Local Pilot.</li>
      </ol>
    </div>
  );
};
