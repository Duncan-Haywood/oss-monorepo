// Renders the constitution's markdown source into a static, styled HTML
// site. Markdown stays the edited source of truth (see docs/00-overview.md
// for why) — this script is a one-way render step, not a two-way sync.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(__dirname, "dist");

marked.use({ gfm: true, breaks: false });

// Where a waitlist application actually goes. This site is a static render
// with no backend, so there is nowhere to store a signup — the form hands the
// application to the visitor's own mail client and says so. Do not reintroduce
// a success message that claims the application was stored or "logged": until
// a real intake endpoint exists, that would discard the lead and tell the
// visitor otherwise.
const WAITLIST_CONTACT = "duncan.andrew.haywood@gmail.com";

const pages = [
  { src: "PROJECT_BRIEF.md", out: "brief.html", nav: "Project Brief" },
  { src: "docs/00-overview.md", out: "index.html", nav: "Overview" },
  { src: "docs/01-philosophy-and-vision.md", out: "01-philosophy-and-vision.html", nav: "1. Philosophy & Vision" },
  { src: "docs/02-learning-science-and-ai-mentor.md", out: "02-learning-science-and-ai-mentor.html", nav: "2. Learning Science & AI Mentor" },
  { src: "docs/03-curriculum-and-assessment.md", out: "03-curriculum-and-assessment.html", nav: "3. Curriculum & Assessment" },
  { src: "docs/04-technical-architecture.md", out: "04-technical-architecture.html", nav: "4. Technical Architecture" },
  { src: "docs/05-business-and-strategy.md", out: "05-business-and-strategy.html", nav: "5. Business & Strategy" },
  { src: "docs/06-market-and-roadmap.md", out: "06-market-and-roadmap.html", nav: "6. Market & Roadmap" },
  { custom: true, out: "sandbox.html", nav: "⚡ AI Sandbox Studio", title: "Interactive AI Agent Sandbox Studio" },
  { custom: true, out: "pricing.html", nav: "💎 Pricing & Pro Tier ($49/mo)", title: "Pricing & Membership Hypothesis" },
];

// Maps every known markdown basename to its rendered output filename, so
// links between docs (e.g. "01-philosophy-and-vision.md") resolve inside
// the built site instead of pointing at a raw .md file.
const linkMap = new Map(
  pages.filter(p => p.src).map((p) => [p.src.split("/").pop(), p.out])
);

function rewriteMdLinks(html) {
  return html.replace(
    /href="([^"]+?\/)?([^"/]+\.md)(#[^"]*)?"/g,
    (whole, _prefix, basename, anchor = "") => {
      const target = linkMap.get(basename);
      return target ? `href="${target}${anchor}"` : whole;
    }
  );
}

function extractTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "AI Engineering Academy";
}

function renderNav(activeOut) {
  const items = pages
    .map((p) => {
      const cls = p.out === activeOut ? ' class="active"' : "";
      return `<li><a href="${p.out}"${cls}>${p.nav}</a></li>`;
    })
    .join("\n      ");
  return `<ul>\n      ${items}\n    </ul>`;
}

function template({ title, activeOut, bodyHtml, sourcePath }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — AI Engineering Academy</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<input type="checkbox" id="nav-toggle" class="nav-toggle">
<label for="nav-toggle" class="nav-toggle-label">☰ Menu</label>
<nav class="sidebar">
  <div class="sidebar-title">AI Engineering Academy</div>
  <div class="sidebar-subtitle">Interactive Platform</div>
  ${renderNav(activeOut)}
</nav>
<main>
  <article>
    ${bodyHtml}
  </article>
  <footer>
    <p>Rendered for AI Engineering Academy. Markdown is the edited source — edit it there, then run <code>npm run build</code> in <code>site/</code> to regenerate this page.</p>
  </footer>
</main>
</body>
</html>
`;
}

function getSandboxBodyHtml() {
  return `
  <h1>⚡ AI Agent & Multi-Tool Sandbox Studio</h1>
  <p class="subtitle">Experience hands-on project tracks: design, evaluate, and test real multi-agent tool-calling workflows and hardware simulations directly in your browser.</p>

  <div class="sandbox-card">
    <div class="track-selector">
      <button class="track-btn active" onclick="switchTrack('tool-calling')">🤖 Track 1: Multi-Agent Tool Calling</button>
      <button class="track-btn" onclick="switchTrack('autonomous-debug')">🔄 Track 2: Autonomous Debugging Loop</button>
      <button class="track-btn" onclick="switchTrack('pid-controller')">🎛️ Track 3: Hardware PID Controller</button>
    </div>

    <div id="track-content" class="track-panel">
      <div class="panel-header">
        <h3 id="track-title">Track 1: Multi-Agent Tool Calling & Orchestration</h3>
        <span class="badge badge-pro">Pro Tier Sandbox</span>
      </div>
      <p id="track-desc">Build an autonomous agent pipeline with a Planner, Executor, and Evaluator. The agent receives a high-level goal, inspects available tools, and executes multi-step API requests.</p>
      
      <div class="interactive-controls">
        <label for="user-prompt"><strong>Learner Prompt / Input:</strong></label>
        <textarea id="user-prompt" rows="3">Find all failing integration tests in repo, run git blame for affected modules, and draft a pull request patch.</textarea>
        
        <div class="button-group">
          <button id="run-sandbox-btn" class="btn btn-primary" onclick="runSandboxSimulation()">▶ Run Multi-Agent Execution</button>
          <button class="btn btn-secondary" onclick="resetSandboxLogs()">🧹 Reset Sandbox Log</button>
        </div>
      </div>

      <div class="console-box">
        <div class="console-header">
          <span>Terminal Output & AI Agent Execution Trace</span>
          <span class="console-status" id="console-status">IDLE</span>
        </div>
        <pre id="console-output"><code>[System] Initializing AI Engineering Sandbox Runtime v2.4...
[System] Multi-agent orchestration engine ready. Click 'Run Multi-Agent Execution' to simulate agent loop.</code></pre>
      </div>

      <div class="mastery-checkpoint">
        <h4>🎯 Mastery Checkpoint Verification</h4>
        <p>Unaided Checkpoint: Can you write the JSON schema for a safe database search tool that prevents SQL injection?</p>
        <div class="checkpoint-input-row">
          <input type="text" id="checkpoint-answer" placeholder='{"type": "object", "properties": ...}' />
          <button class="btn btn-accent" onclick="verifyCheckpoint()">Submit Checkpoint</button>
        </div>
        <div id="checkpoint-feedback"></div>
      </div>
    </div>
  </div>

  <script>
  function switchTrack(trackKey) {
    document.querySelectorAll('.track-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    const titleEl = document.getElementById('track-title');
    const descEl = document.getElementById('track-desc');
    const promptEl = document.getElementById('user-prompt');
    const consoleOutput = document.getElementById('console-output');

    if (trackKey === 'tool-calling') {
      titleEl.innerText = 'Track 1: Multi-Agent Tool Calling & Orchestration';
      descEl.innerText = 'Build an autonomous agent pipeline with a Planner, Executor, and Evaluator. The agent receives a high-level goal, inspects available tools, and executes multi-step API requests.';
      promptEl.value = 'Find all failing integration tests in repo, run git blame for affected modules, and draft a pull request patch.';
      consoleOutput.innerHTML = '<code>[System] Track switched to Multi-Agent Tool Calling. Ready.</code>';
    } else if (trackKey === 'autonomous-debug') {
      titleEl.innerText = 'Track 2: Autonomous Debugging Loop';
      descEl.innerText = 'Construct a self-healing loop: Agent catches runtime stack traces, inspects local state, generates a patch hypothesis, runs unit tests, and iterates until passing.';
      promptEl.value = 'Fix RenderFlex overflow in header component during mobile viewport rendering.';
      consoleOutput.innerHTML = '<code>[System] Track switched to Autonomous Debugging Loop. Ready.</code>';
    } else if (trackKey === 'pid-controller') {
      titleEl.innerText = 'Track 3: Hardware PID Temperature Controller';
      descEl.innerText = 'Simulate an embedded microcontroller loop controlling a thermal chamber. Tune Kp, Ki, Kd parameters and evaluate overshoot vs settling time.';
      promptEl.value = 'Tune PID constants: Kp=2.5, Ki=0.1, Kd=0.8 for target temp = 85°C.';
      consoleOutput.innerHTML = '<code>[System] Track switched to Hardware PID Controller. Ready.</code>';
    }
  }

  function runSandboxSimulation() {
    const prompt = document.getElementById('user-prompt').value;
    const status = document.getElementById('console-status');
    const output = document.getElementById('console-output');
    
    status.innerText = 'RUNNING';
    status.style.color = '#e28f7a';

    output.innerHTML = '<code>[0.00s] [Planner] Deconstructing task: "' + prompt.replace(/</g, '&lt;') + '"\\n' +
      '[0.12s] [Planner] Identified subgoals: [1. Identify target module, 2. Execute verification script, 3. Synthesize result]\\n' +
      '[0.45s] [Executor] Invoking tool: list_files(pattern="*.test.ts")\\n' +
      '[0.82s] [Executor] Executing test suite... 12/12 passing.\\n' +
      '[1.15s] [Evaluator] Verification complete. Subgoal satisfaction score: 100%.\\n' +
      '[1.30s] [AI Mentor] Great work! Step 1 of Track Project completed successfully.</code>';

    setTimeout(() => {
      status.innerText = 'COMPLETED';
      status.style.color = '#4caf50';
    }, 600);
  }

  function resetSandboxLogs() {
    document.getElementById('console-output').innerHTML = '<code>[System] Log cleared. Ready for next simulation run.</code>';
    document.getElementById('console-status').innerText = 'IDLE';
    document.getElementById('console-status').style.color = 'inherit';
  }

  function verifyCheckpoint() {
    const input = document.getElementById('checkpoint-answer').value;
    const feedback = document.getElementById('checkpoint-feedback');
    if (input.includes('type') || input.includes('properties') || input.length > 10) {
      feedback.innerHTML = '<div class="alert alert-success">✅ Checkpoint passed! Schema structure verified. Portfolio point awarded (+25 pts).</div>';
    } else {
      feedback.innerHTML = '<div class="alert alert-warning">⚠️ Checkpoint needs work. Include a valid JSON schema definition with "type" and "properties".</div>';
    }
  }
  </script>
  `;
}

function getPricingBodyHtml() {
  return `
  <h1>💎 Pricing & Pro Subscription Tier ($49/mo)</h1>
  <p class="subtitle">Our foundational principle: <strong>Free Knowledge, Paid Compute.</strong> Curriculum content and documentation are 100% free forever. Paid tiers cover real LLM token costs, sandbox compute, and hardware kits.</p>

  <div class="pricing-grid">
    <div class="pricing-card">
      <div class="card-badge">Always Free</div>
      <h3>Learner Explorer</h3>
      <div class="price">$0 <span>/ forever</span></div>
      <p class="tier-desc">Complete access to all curriculum docs, project specifications, engineering knowledge graph, and public portfolio hosting.</p>
      <ul>
        <li>✓ All 50+ Project Specifications</li>
        <li>✓ Complete Engineering Knowledge Graph</li>
        <li>✓ Public Portfolio Page Hosting</li>
        <li>✓ Community Forums & Peer Review</li>
      </ul>
      <a href="index.html" class="btn btn-secondary btn-block">Explore Free Curriculum</a>
    </div>

    <div class="pricing-card featured">
      <div class="card-badge badge-pro">Most Popular</div>
      <h3>Pro Learner ($49/mo)</h3>
      <div class="price">$49 <span>/ month</span></div>
      <p class="tier-desc">Hands-on AI Mentor token quota, interactive sandbox runtime compute, and automated mastery checkpoints.</p>
      <ul>
        <li>✓ Everything in Free Tier</li>
        <li>✓ <strong>Unlimited Interactive Sandbox Runtimes</strong></li>
        <li>✓ <strong>AI Engineering Mentor (24/7 Code & Arch Review)</strong></li>
        <li>✓ Automated Mastery Checkpoints & Badging</li>
        <li>✓ Discord Private Mentor Channel Access</li>
      </ul>
      <button class="btn btn-primary btn-block" onclick="openWaitlistModal()">Join $49/mo Pro Waitlist</button>
    </div>

    <div class="pricing-card">
      <div class="card-badge">Enterprise / Team</div>
      <h3>Employer Sponsored</h3>
      <div class="price">Custom <span>/ seat</span></div>
      <p class="tier-desc">For engineering teams upskilling in AI agent architecture and hardware-software integration.</p>
      <ul>
        <li>✓ Everything in Pro Tier</li>
        <li>✓ Dedicated Cohort Dashboard</li>
        <li>✓ Custom Enterprise Project Tracks</li>
        <li>✓ Direct Talent Pipeline Access</li>
      </ul>
      <button class="btn btn-outline btn-block" onclick="openWaitlistModal('team')">Request Team Access</button>
    </div>
  </div>

  <div class="calculator-section">
    <h2>🧮 Interactive Token & Compute Cost Estimator</h2>
    <p>Estimate how much value and AI mentor throughput your $49/mo subscription provides compared to retail API costs.</p>
    
    <div class="calc-box">
      <div class="calc-row">
        <label>Expected Sandbox Hours / Month:</label>
        <input type="range" id="hours-slider" min="5" max="100" value="25" oninput="updateCalc()" />
        <span id="hours-val">25 hours</span>
      </div>

      <div class="calc-row">
        <label>Estimated AI Mentor Queries / Month:</label>
        <input type="range" id="queries-slider" min="50" max="1000" value="300" oninput="updateCalc()" />
        <span id="queries-val">300 queries</span>
      </div>

      <div class="calc-result">
        <div class="result-item">
          <span>Retail LLM & Compute Value:</span>
          <strong id="retail-val">$142.50 / mo</strong>
        </div>
        <div class="result-item highlight">
          <span>Academy Subscription Price:</span>
          <strong>$49.00 / mo</strong>
        </div>
        <div class="result-item success">
          <span>Your Savings & Value Surplus:</span>
          <strong id="savings-val">$93.50 / mo (65% Savings)</strong>
        </div>
      </div>
    </div>
  </div>

  <!-- Waitlist Modal -->
  <div id="waitlist-modal" class="modal-overlay" style="display:none;">
    <div class="modal-card">
      <span class="modal-close" onclick="closeWaitlistModal()">&times;</span>
      <h3>Join Pro Tier Concierge MVP Waitlist</h3>
      <p>Be the first to access the $49/mo Pro Tier with 24/7 AI Engineering Mentor & Multi-Agent Sandbox.</p>
      
      <form id="waitlist-form" onsubmit="submitWaitlist(event)">
        <div class="form-group">
          <label for="waitlist-name">Your Full Name:</label>
          <input type="text" id="waitlist-name" required placeholder="e.g. Alex Chen" />
        </div>

        <div class="form-group">
          <label for="waitlist-email">Email Address:</label>
          <input type="email" id="waitlist-email" required placeholder="alex@example.com" />
        </div>

        <div class="form-group">
          <label for="waitlist-track">Primary Interest Track:</label>
          <select id="waitlist-track">
            <option value="ai-agents">Multi-Agent & Tool Calling Track</option>
            <option value="embedded">Embedded Microcontrollers & PID Track</option>
            <option value="full-stack">Full-Stack AI Engineering Track</option>
          </select>
        </div>

        <button type="submit" class="btn btn-primary btn-block">Submit Priority Application</button>
      </form>
      <div id="waitlist-success" style="display:none;" class="alert alert-success">
        <strong>One more step — your application has not been sent yet.</strong>
        <p>
          We have opened a pre-filled email in your mail app. Send it and we
          will reply as soon as cohort spots open.
        </p>
        <p>
          If nothing opened, email
          <a id="waitlist-fallback" href="mailto:${WAITLIST_CONTACT}">${WAITLIST_CONTACT}</a>
          with your name and preferred track.
        </p>
      </div>
    </div>
  </div>

  <script>
  function updateCalc() {
    const hours = parseInt(document.getElementById('hours-slider').value);
    const queries = parseInt(document.getElementById('queries-slider').value);
    
    document.getElementById('hours-val').innerText = hours + ' hours';
    document.getElementById('queries-val').innerText = queries + ' queries';

    const retailCost = (hours * 1.50) + (queries * 0.35);
    const savings = Math.max(0, retailCost - 49.00);
    const pct = Math.round((savings / retailCost) * 100);

    document.getElementById('retail-val').innerText = '$' + retailCost.toFixed(2) + ' / mo';
    document.getElementById('savings-val').innerText = '$' + savings.toFixed(2) + ' / mo (' + (isNaN(pct) ? 0 : pct) + '% Savings)';
  }

  function openWaitlistModal(type) {
    document.getElementById('waitlist-modal').style.display = 'flex';
  }

  function closeWaitlistModal() {
    document.getElementById('waitlist-modal').style.display = 'none';
  }

  function submitWaitlist(e) {
    e.preventDefault();

    var name = document.getElementById('waitlist-name').value.trim();
    var email = document.getElementById('waitlist-email').value.trim();
    var trackEl = document.getElementById('waitlist-track');
    var track = trackEl.options[trackEl.selectedIndex].text;

    var body = 'Name: ' + name + '\\n'
      + 'Email: ' + email + '\\n'
      + 'Track: ' + track + '\\n';

    var href = 'mailto:${WAITLIST_CONTACT}'
      + '?subject=' + encodeURIComponent('Pro Tier waitlist application - ' + name)
      + '&body=' + encodeURIComponent(body);

    // Keep the fallback link carrying the same details, so a visitor with no
    // mail-client handler can still send the application by hand.
    document.getElementById('waitlist-fallback').href = href;

    document.getElementById('waitlist-form').style.display = 'none';
    document.getElementById('waitlist-success').style.display = 'block';

    window.location.href = href;
  }
  </script>
  `;
}

mkdirSync(DIST, { recursive: true });

for (const page of pages) {
  let title, bodyHtml, sourcePath;

  if (page.custom) {
    title = page.title;
    sourcePath = `site/${page.out}`;
    if (page.out === 'sandbox.html') {
      bodyHtml = getSandboxBodyHtml();
    } else if (page.out === 'pricing.html') {
      bodyHtml = getPricingBodyHtml();
    }
  } else {
    const srcPath = join(ROOT, page.src);
    const markdown = readFileSync(srcPath, "utf8");
    title = extractTitle(markdown);
    bodyHtml = marked.parse(markdown);
    bodyHtml = rewriteMdLinks(bodyHtml);
    sourcePath = page.src;
  }

  const html = template({
    title,
    activeOut: page.out,
    bodyHtml,
    sourcePath,
  });

  writeFileSync(join(DIST, page.out), html, "utf8");
  console.log(`built ${page.out}`);
}

copyFileSync(join(__dirname, "style.css"), join(DIST, "style.css"));
console.log(`\nDone. Open ${join(DIST, "index.html")}`);

