import { FileText } from "lucide-react";

export default function BusinessPlanPage() {
  return (
    <div className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-blue-600">
      <div className="flex items-center gap-3 mb-8 not-prose pb-6 border-b border-gray-100">
        <div className="p-2 bg-gray-100 rounded-lg">
          <FileText className="w-6 h-6 text-gray-700" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 m-0">Executive Summary</h1>
      </div>

      <p className="lead text-xl text-gray-600">
        Print Atelier is a two-sided art commerce platform that digitizes original paintings and sells high-quality prints. By sitting between artists and buyers, we provide a <strong>digitization + distribution layer</strong> that frees artists from the burden of logistics while creating a scalable, high-margin catalog of fine art.
      </p>

      <p>
        Unlike traditional galleries or manual agencies, Print Atelier is built from day one as a <strong>software-first, AI-first, and digital-first</strong> business. By leveraging automation for outreach, AI for asset generation and curation, and software for seamless payouts, we can scale globally without linear headcount growth.
      </p>

      <h2>Core Vision: Software & AI First</h2>
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
    </div>
  );
}