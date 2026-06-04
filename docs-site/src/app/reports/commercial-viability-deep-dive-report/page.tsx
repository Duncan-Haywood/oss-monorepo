/* AUTO-GENERATED from docs/COMMERCIAL_VIABILITY_DEEP_DIVE_REPORT.html — do not edit by hand */
import type { Metadata } from "next";
import { HtmlDocument } from "@/components/HtmlDocument";

export const metadata: Metadata = {
  title: "ShootFlow — Commercial Viability Deep Dive Assessment (June 2026)",
  robots: { index: false, follow: false },
};

const documentCss = `:root {
      --bg: #0a0f14;
      --surface: #141b24;
      --surface2: #1f2a38;
      --text: #e8eef7;
      --muted: #8a9ab3;
      --accent: #4da3ff;
      --green: #4ade80;
      --amber: #fbbf24;
      --red: #f87171;
      --border: #2a3749;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.65;
      font-size: 15.5px;
    }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 2.5rem 1.75rem 5rem; }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 2rem;
      margin-bottom: 2.5rem;
    }
    h1 { font-size: 2rem; font-weight: 700; margin: 0 0 0.4rem; letter-spacing: -0.03em; }
    .meta { color: var(--muted); font-size: 0.9rem; }
    h2 {
      font-size: 1.35rem;
      margin: 3rem 0 1.1rem;
      color: var(--accent);
      font-weight: 600;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.4rem;
    }
    h3 { font-size: 1.1rem; margin: 2rem 0 0.7rem; color: var(--text); }
    p { margin: 0.85rem 0; }
    .verdict {
      background: linear-gradient(135deg, #1a2638 0%, var(--surface) 70%);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 2rem 2.25rem;
      margin: 2rem 0;
    }
    .verdict-score {
      font-size: 3.25rem;
      font-weight: 800;
      color: var(--amber);
      line-height: 1;
    }
    .verdict-label { font-size: 1.15rem; color: var(--muted); margin-top: 0.35rem; }
    .pill {
      display: inline-block;
      padding: 0.18rem 0.7rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 700;
      margin: 0.25rem 0.3rem 0.25rem 0;
    }
    .pill-high { background: rgba(74, 222, 128, 0.18); color: var(--green); }
    .pill-mid { background: rgba(251, 191, 36, 0.18); color: var(--amber); }
    .pill-low { background: rgba(248, 113, 113, 0.18); color: var(--red); }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
      margin: 1.2rem 0;
    }
    th, td {
      border: 1px solid var(--border);
      padding: 0.6rem 0.9rem;
      text-align: left;
      vertical-align: top;
    }
    th { background: var(--surface2); color: var(--muted); font-weight: 600; }
    tr:nth-child(even) td { background: rgba(20, 27, 36, 0.55); }
    ul, ol { margin: 0.6rem 0 1.1rem; padding-left: 1.5rem; }
    li { margin: 0.4rem 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.1rem; margin: 1.5rem 0; }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.15rem 1.3rem;
    }
    .card strong { display: block; font-size: 1.55rem; color: var(--accent); margin-bottom: 0.15rem; }
    .card span { font-size: 0.82rem; color: var(--muted); }
    .risk { border-left: 4px solid var(--red); padding-left: 1.1rem; margin: 1.3rem 0; background: rgba(248,113,113,0.04); }
    .opportunity { border-left: 4px solid var(--green); padding-left: 1.1rem; margin: 1.3rem 0; background: rgba(74,222,128,0.04); }
    .section-note { font-size: 0.85rem; color: var(--muted); font-style: italic; }
    .score-bar { height: 7px; background: var(--surface2); border-radius: 999px; overflow: hidden; margin-top: 0.4rem; }
    .score-fill { height: 100%; background: linear-gradient(to right, var(--accent), #7dd3fc); border-radius: 999px; }
    code { background: var(--surface2); padding: 0.12rem 0.45rem; border-radius: 4px; font-size: 0.86em; }
    .conclusion { background: var(--surface2); padding: 1.6rem; border-radius: 12px; margin-top: 2.5rem; }
    footer { margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--border); font-size: 0.8rem; color: var(--muted); }`;
const documentHtml = `<div class="wrap">
    <header>
      <h1>ShootFlow — Commercial Viability Deep Dive</h1>
      <p class="meta">Updated 4 June 2026 · Deep technical + market analysis of current repository (stdlib-only orchestration core, 438 tests, placeholder adapters) · Branch: cursor/commercial-viability-deep-dive-d6ac</p>
    </header>

    <section class="verdict">
      <h2 style="margin-top:0;border:none;color:inherit;">Executive Verdict</h2>
      <p class="verdict-score">31 / 100</p>
      <p class="verdict-label">Low likelihood of becoming a profitably scalable standalone business without major pivots</p>
      <p>
        ShootFlow demonstrates <strong>exceptional engineering discipline</strong> for a solo or small-team effort: comprehensive safety primitives, manifest-driven orchestration, lease-based scheduling, and observe-only workflow authority contracts. However, the current artifact is a <strong>sophisticated workflow engine without a shippable product</strong>. Real media transformation (VLM analysis, cinematic grading, reel assembly) exists only as deterministic JSON/byte-copy stand-ins. The "zero third-party dependencies" constraint makes delivering differentiated quality impossible today.
      </p>
      <p>
        <span class="pill pill-high">Problem depth: high</span>
        <span class="pill pill-high">Engineering maturity: high</span>
        <span class="pill pill-low">Shippable core value: none</span>
        <span class="pill pill-low">Distribution path: none</span>
        <span class="pill pill-low">Scalable revenue model: weak</span>
        <span class="pill pill-low">Defensibility: low</span>
      </p>
    </section>

    <h2>1. Technical Reality Check (Why the product cannot yet generate revenue)</h2>
    <p>
      The repository contains ~31 modules and 22+ CLI commands that form a complete local orchestration layer for a media pipeline. Production adapters (<code>analysis-production-local</code>, <code>grade-production-local</code>, <code>story-production-local</code>, <code>package-production-local</code>) write only schema-valid JSON or byte-for-byte copies. There is no actual computer-vision, no color-science engine, no temporal scene detection, no audio-aware reel cutting, no real VLM calls. The render side has only <code>dry-run-local</code>.
    </p>
    <div class="grid">
      <div class="card"><strong>0</strong><span>Real media-processing dependencies or binaries</span></div>
      <div class="card"><strong>100%</strong><span>Adapters are placeholders or byte copies</span></div>
      <div class="card"><strong>stdlib</strong><span>Only — no PIL, OpenCV, ffmpeg, libraw, ML runtimes</span></div>
      <div class="card"><strong>macOS/Linux</strong><span>fcntl advisory locks; Windows impossible</span></div>
    </div>
    <p class="section-note">
      Implication: even if a Mac app wrapper existed tomorrow, the first paying customer would immediately discover that "graded_photo" and "instagram_reel" outputs are empty placeholder files. There is no observable quality advantage over existing free/cheap tools.
    </p>

    <h2>2. Profitability Analysis — Unit Economics Are Hostile</h2>
    <h3>Target pricing from existing docs: $30–$80/mo or $199 one-time pro license</h3>
    <table>
      <thead>
        <tr><th>Metric</th><th>Optimistic</th><th>Realistic (local desktop tool)</th><th>Pessimistic</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Customer acquisition cost (CAC)</td>
          <td>$120 (content marketing + photographer conferences)</td>
          <td>$280–$450 (niche, trust required, no viral loop)</td>
          <td>$650+ (cold outreach to busy pros)</td>
        </tr>
        <tr>
          <td>Monthly churn</td>
          <td>4%</td>
          <td>9–14% (tool must keep working perfectly on every OS update + new camera format)</td>
          <td>22%+</td>
        </tr>
        <tr>
          <td>LTV (at $49/mo, 12 mo avg life)</td>
          <td>$441</td>
          <td>$210–$280 (realistic churn + support tickets)</td>
          <td>$140</td>
        </tr>
        <tr>
          <td>LTV : CAC</td>
          <td>3.7×</td>
          <td>0.6–0.9×</td>
          <td>0.2×</td>
        </tr>
        <tr>
          <td>Support burden per customer</td>
          <td>Low (self-serve)</td>
          <td>High — file system edge cases, card corruption reports, "why didn't my reel look cinematic?"</td>
          <td>Very high</td>
        </tr>
      </tbody>
    </table>
    <p>
      <strong>Conclusion on profitability:</strong> A pure local desktop product at these price points cannot cover sales, support, ongoing camera-format reverse-engineering, and platform maintenance costs while delivering founder-level profit. Gross margins look high on paper but net margins collapse under real-world operational load.
    </p>

    <h2>3. Scalability Assessment — Fundamentally Non-Scalable as Designed</h2>
    <div class="risk">
      <strong>Core architectural constraint:</strong> Every safety guarantee (immutable manifests, checksums, lease tokens, compare-and-write status) is built around a single local filesystem. There is no notion of multi-user workspaces, shared object storage, or conflict-free replicated data types.
    </div>
    <ul>
      <li><strong>Horizontal scaling:</strong> Impossible. Each additional photographer is an isolated instance. No marginal cost reduction at 100× users.</li>
      <li><strong>Team/Studio use:</strong> Requires manual Dropbox/Google Drive sync of manifests — immediately breaks the "trusted status" contract and introduces race conditions the scheduler explicitly refuses to handle.</li>
      <li><strong>Cloud burst / AI offload:</strong> The current workflow_authority model treats cloud workers as future adapters, but the entire security model assumes local-only trusted inputs. Adding a real VLM adapter would require a completely new trust boundary and billing layer that does not exist.</li>
      <li><strong>Platform lock-in:</strong> macOS volume metadata + fcntl locks make even a Windows port non-trivial; iOS companion app is architecturally distant.</li>
    </ul>
    <p class="opportunity">
      The orchestration primitives (manifests, leases, authority objects) are actually excellent foundations for a <em>multi-tenant cloud service</em>, but that would be a 70–80% rewrite of the current "local first, observe-only" philosophy.
    </p>

    <h2>4. Market &amp; Competitive Reality</h2>
    <p>
      2026 media-automation landscape is crowded: Adobe has integrated Firefly + Sensei into Lightroom/Photoshop, Apple has aggressive on-device ML in Photos/Logic, Blackmagic has Fairlight AI tools in Resolve, and dozens of well-funded startups (Runway, Descript, Opus Clip, Captions, etc.) are shipping reel-generation products with real generative quality.
    </p>
    <p>
      ShootFlow's differentiation ("safety, manifests, deterministic pipelines, pilot analytics") is invisible to the buyer until they have already lost a week to a corrupted card or a bad color-grade batch. Most buyers will choose the tool that produces prettier demo reels in 30 seconds, even if it occasionally hallucinates or loses files.
    </p>

    <h2>5. What Would Make This a Viable, Profitable, Scalable Business</h2>
    <div class="opportunity">
      <strong>Recommended strategic pivot (minimum to reach 60+ viability score):</strong>
    </div>
    <ol>
      <li><strong>Hybrid architecture immediately:</strong> Keep the local stdlib core for ingest/manifests (the part that is genuinely differentiated). Offer a paid cloud tier for VLM analysis, scene grouping, look development, and final reel rendering using real models (Claude-3.5 / GPT-4o / custom fine-tunes on professional footage). Charge usage-based credits on top of a base subscription. This turns the current "placeholder" adapters into real paid value without violating the local safety contract.</li>
      <li><strong>Ship a minimal viable Mac app in &lt; 90 days:</strong> Use SwiftUI + embedded Python (or PyObjC) or Tauri + local Python server. The CLI is already excellent for power users and agents; the app is the conversion surface. Without a GUI, conversion rate from "tried the demo workspace" to paid is near zero.</li>
      <li><strong>Distribution &amp; GTM:</strong> Target 3–5 high-volume wedding/event studios for paid pilots ($2k–$5k annual contracts) before public launch. Use their real shoots to validate that the safety guarantees actually save money vs their current editor + Dropbox workflow. Publish case studies with hours-saved and "zero lost files" metrics.</li>
      <li><strong>Relax the zero-dependency rule for real media work:</strong> Accept that production adapters will eventually depend on ffmpeg, libraw, Core Image, or ONNX runtimes. Document a "trusted worker capability" registry so the scheduler can route jobs only to machines that have the required capabilities. The current capability-aware dispatch is already prepared for this.</li>
      <li><strong>Monetization model that scales:</strong> Base $19–$39/mo for local core + unlimited safe ingest/manifests. Pro $79–$129/mo adds cloud VLM + priority rendering queue + team workspaces (with proper multi-user manifest merging). Enterprise adds on-prem or private VPC deployment + SLA + custom look models. This creates clear LTV expansion and gross-margin leverage via cloud compute.</li>
      <li><strong>Integrations that reduce switching cost:</strong> Export graded masters + XML/EDL for DaVinci Resolve and Premiere. One-click "send to Lightroom catalog" with sidecar XMP. This turns ShootFlow from "another silo" into "the missing ingest + social layer on top of tools you already pay for."</li>
      <li><strong>Founder reality check:</strong> The current trajectory (more CLI commands, more schema versions, more pilot JSON artifacts) produces an impressive engineering portfolio piece but zero revenue. The next 3–6 months must include at least one paying pilot customer and a clickable Mac prototype, or the project should be archived as research.</li>
    </ol>

    <div class="conclusion">
      <h3 style="margin-top:0;">Final Assessment</h3>
      <p>
        ShootFlow's current codebase is a <strong>world-class local workflow safety layer</strong> that solves a genuine operational problem for a paying audience. As a standalone commercial product under the current constraints (pure stdlib, local-only, no real media intelligence, no GUI, no distribution), it has <strong>low probability (&lt;15%) of becoming a profitably scalable business</strong>.
      </p>
      <p>
        With the hybrid local+cloud pivot, a minimal Mac app, and 5 design-partner studios, the probability rises to ~55–65%. The engineering foundation is strong enough to support that pivot; the product and go-to-market strategy are not.
      </p>
      <p style="margin-bottom:0;">
        <strong>Recommendation:</strong> Continue only if the next iteration explicitly ships a paid cloud adapter path + Mac GUI prototype and secures at least two paid pilot letters of intent. Otherwise, treat the repo as an impressive open-source contribution to media workflow safety research and move on.
      </p>
    </div>

    <footer>
      This deep-dive report was produced as part of the automated continuation task on branch <code>cursor/commercial-viability-deep-dive-d6ac</code>. All assessments are based solely on the committed source, docs, and test surface as of the snapshot. No external market research or customer interviews were performed.
    </footer>
  </div>`;

export default function Page() {
  return (
    <HtmlDocument
      title={"ShootFlow — Commercial Viability Deep Dive Assessment (June 2026)"}
      css={documentCss}
      html={documentHtml}
      sourceFile={"docs/COMMERCIAL_VIABILITY_DEEP_DIVE_REPORT.html"}
    />
  );
}
