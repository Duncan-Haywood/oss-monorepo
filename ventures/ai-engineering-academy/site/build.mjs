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

// The checkpoint grader is written once, in checkpoint-validator.mjs, and
// inlined here because the built site is static files with no bundler. The
// test suite imports that module directly, so the rules under test are the
// rules the learner meets. Keep this a source-level inline rather than a
// reimplementation: two copies of a grader drift, and the drift is invisible
// from the page.
const CHECKPOINT_VALIDATOR_SOURCE = readFileSync(
  join(__dirname, "checkpoint-validator.mjs"),
  "utf8"
)
  // Drop the module's own header block. It is maintainer commentary about how
  // the grader came to be written this way, and the page is a public artifact.
  // Comments inside the function stay: they explain the rules to the learner
  // reading the source, which is the point of the exercise.
  .replace(/^(?:\/\/[^\n]*\n|\s*\n)+/, "")
  .replace(/^export \{[^}]*\};?\s*$/m, "")
  .trim();

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

function template({ title, activeOut, bodyHtml, sourcePath, wide }) {
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
  <article${wide ? ' class="wide"' : ""}>
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
  <p class="subtitle">Three project tracks in design. The walkthrough below is a written storyboard of the agent loop each track teaches; the mastery checkpoint underneath it is a working grader you can use right now.</p>

  <div class="notice notice-preview">
    <strong>What runs here, and what does not.</strong>
    <p>
      This page is a static preview of a platform still being built. The
      walkthrough is scripted prose — no model is called, no code is executed,
      and nothing you type is sent anywhere or stored. The mastery checkpoint is
      the exception: it is a real JSON Schema validator running in your browser,
      and it will reject an answer that does not hold up.
    </p>
  </div>

  <div class="sandbox-card">
    <div class="track-selector">
      <button class="track-btn active" data-track="tool-calling" onclick="switchTrack('tool-calling', this)">🤖 Track 1: Multi-Agent Tool Calling</button>
      <button class="track-btn" data-track="autonomous-debug" onclick="switchTrack('autonomous-debug', this)">🔄 Track 2: Autonomous Debugging Loop</button>
      <button class="track-btn" data-track="pid-controller" onclick="switchTrack('pid-controller', this)">🎛️ Track 3: Hardware PID Controller</button>
    </div>

    <div id="track-content" class="track-panel">
      <div class="panel-header">
        <h3 id="track-title">Track 1: Multi-Agent Tool Calling & Orchestration</h3>
        <span class="badge badge-planned">Planned for Pro tier — not yet built</span>
      </div>
      <p id="track-desc">Build an autonomous agent pipeline with a Planner, Executor, and Evaluator. The agent receives a high-level goal, inspects available tools, and executes multi-step API requests.</p>
      
      <div class="interactive-controls">
        <label for="user-prompt"><strong>The goal you would hand the agent:</strong></label>
        <textarea id="user-prompt" rows="3">Find all failing integration tests in repo, run git blame for affected modules, and draft a pull request patch.</textarea>

        <div class="button-group">
          <button id="run-sandbox-btn" class="btn btn-primary" onclick="showWalkthrough()">📖 Show the agent-loop walkthrough</button>
          <button class="btn btn-secondary" onclick="resetWalkthrough()">🧹 Clear</button>
        </div>
      </div>

      <div class="console-box">
        <div class="console-header">
          <span>Scripted walkthrough — illustrative, nothing is executed</span>
          <span class="console-status" id="console-status">NOT RUN</span>
        </div>
        <pre id="console-output"><code>Choose a track above, then press "Show the agent-loop walkthrough" to read
the stages a real run would move through. This box never reports a result,
because nothing here runs.</code></pre>
      </div>

      <div class="mastery-checkpoint">
        <h4>🎯 Mastery Checkpoint</h4>
        <p>
          Write the JSON schema for a database search tool that a model can call
          without opening a SQL injection path. Your answer is graded in this
          page against six rules; nothing is uploaded, and no progress is
          recorded, because there is no account system yet.
        </p>
        <div class="checkpoint-input-row">
          <textarea id="checkpoint-answer" rows="6" placeholder='{"type": "object", "properties": {"table": {"type": "string", "enum": ["orders"]}}, "required": ["table"], "additionalProperties": false}'></textarea>
          <button class="btn btn-accent" onclick="verifyCheckpoint()">Grade my schema</button>
        </div>
        <div id="checkpoint-feedback"></div>
      </div>
    </div>
  </div>

  <script>
  ${CHECKPOINT_VALIDATOR_SOURCE}

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // One record per track drives the buttons, the copy and the walkthrough, so
  // the stages shown always belong to the track that is selected. They did not
  // before: every track printed Track 1's test-suite story.
  var TRACKS = {
    'tool-calling': {
      title: 'Track 1: Multi-Agent Tool Calling & Orchestration',
      desc: 'Build an autonomous agent pipeline with a Planner, Executor, and Evaluator. The agent receives a high-level goal, inspects available tools, and executes multi-step API requests.',
      prompt: 'Find all failing integration tests in repo, run git blame for affected modules, and draft a pull request patch.',
      stages: [
        '[Planner]    Split the goal into ordered subgoals, and decide which of them need a tool.',
        '[Planner]    Read the tool schemas available, and reject any subgoal no tool can serve.',
        '[Executor]   Call one tool at a time, feeding each result back before choosing the next.',
        '[Evaluator]  Check the result against the original goal, not against the last tool call.',
        '[Evaluator]  Hand control back to the Planner when a subgoal fails, with the failure attached.'
      ]
    },
    'autonomous-debug': {
      title: 'Track 2: Autonomous Debugging Loop',
      desc: 'Construct a self-healing loop: the agent catches runtime stack traces, inspects local state, generates a patch hypothesis, runs unit tests, and iterates until passing.',
      prompt: 'Fix RenderFlex overflow in header component during mobile viewport rendering.',
      stages: [
        '[Observer]   Capture the stack trace and the state around the failing frame.',
        '[Hypothesis] Propose one cause, stated so that a test could refute it.',
        '[Patch]      Make the smallest edit that would falsify the hypothesis if it is wrong.',
        '[Verify]     Run the suite. A patch that turns the test green for another reason has failed.',
        '[Loop]       Feed the outcome back as evidence, and stop after a fixed attempt budget.'
      ]
    },
    'pid-controller': {
      title: 'Track 3: Hardware PID Temperature Controller',
      desc: 'Simulate an embedded microcontroller loop controlling a thermal chamber. Tune Kp, Ki, Kd parameters and evaluate overshoot against settling time.',
      prompt: 'Tune PID constants: Kp=2.5, Ki=0.1, Kd=0.8 for target temp = 85°C.',
      stages: [
        '[Model]      State the thermal plant: mass, heater power, ambient loss, sensor lag.',
        '[Tune]       Raise Kp until it oscillates, then add Kd to damp it and Ki to remove offset.',
        '[Measure]    Record overshoot, settling time and steady-state error as three separate numbers.',
        '[Trade]      Decide which of the three this application can afford to lose. Nothing wins all three.',
        '[Guard]      Clamp integral windup, and decide what the loop does when the sensor drops out.'
      ]
    }
  };

  function switchTrack(trackKey, buttonEl) {
    var track = TRACKS[trackKey];
    if (!track) return;

    var buttons = document.querySelectorAll('.track-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.remove('active');
    }
    if (buttonEl) buttonEl.classList.add('active');

    document.getElementById('track-title').innerText = track.title;
    document.getElementById('track-desc').innerText = track.desc;
    document.getElementById('user-prompt').value = track.prompt;
    resetWalkthrough();
  }

  function activeTrackKey() {
    var active = document.querySelector('.track-btn.active');
    return (active && active.getAttribute('data-track')) || 'tool-calling';
  }

  function showWalkthrough() {
    var track = TRACKS[activeTrackKey()];
    var goal = document.getElementById('user-prompt').value;
    var output = document.getElementById('console-output');

    var lines = ['Goal you entered: ' + escapeHtml(goal), ''];
    for (var i = 0; i < track.stages.length; i++) {
      lines.push(escapeHtml(track.stages[i]));
    }
    lines.push('');
    lines.push('This is a written walkthrough of the stages, not a transcript.');
    lines.push('No model was called and no code was run, so there is no result to report.');

    output.innerHTML = '<code>' + lines.join('\\n') + '</code>';
    document.getElementById('console-status').innerText = 'WALKTHROUGH SHOWN';
  }

  function resetWalkthrough() {
    document.getElementById('console-output').innerHTML =
      '<code>Cleared. Press "Show the agent-loop walkthrough" to read the stages again.</code>';
    document.getElementById('console-status').innerText = 'NOT RUN';
  }

  function verifyCheckpoint() {
    var input = document.getElementById('checkpoint-answer').value;
    var feedback = document.getElementById('checkpoint-feedback');
    var result = validateToolSchema(input);

    var rows = '';
    for (var i = 0; i < result.checks.length; i++) {
      var check = result.checks[i];
      var mark = check.passed ? '✅' : '❌';
      var detail = check.detail
        ? ' <span class="check-detail">' + escapeHtml(check.detail) + '</span>'
        : '';
      rows += '<li class="' + (check.passed ? 'check-pass' : 'check-fail') + '">' +
        mark + ' ' + escapeHtml(check.label) + detail + '</li>';
    }

    var heading = result.ok
      ? '<div class="alert alert-success"><strong>All six rules hold.</strong> This schema constrains what a model can hand your query builder. Nothing is recorded — there is no account system yet.</div>'
      : '<div class="alert alert-warning"><strong>Not yet.</strong> The rules below that failed are the ones an injection would come through.</div>';

    feedback.innerHTML = heading + '<ul class="check-list">' + rows + '</ul>';
  }
  </script>
  `;
}

function getPricingBodyHtml() {
  return `
  <h1>💎 Pricing & Pro Subscription Tier ($49/mo)</h1>
  <p class="subtitle">Our foundational principle: <strong>Free Knowledge, Paid Compute.</strong> Curriculum content and documentation are 100% free forever. Paid tiers are intended to cover real LLM token costs, sandbox compute, and hardware kits.</p>

  <div class="notice notice-preview">
    <strong>Nothing on this page is on sale yet.</strong>
    <p>
      The Academy is pre-launch. There is no checkout, no subscription and no
      account system — the $49/mo figure is a price we are testing, not a price
      being charged, and the only thing either button below does is open a
      waitlist form. Each tier separates what exists today from what is still
      planned, so you can tell which is which before you give us your email.
    </p>
  </div>

  <div class="pricing-grid">
    <div class="pricing-card">
      <div class="card-badge">Available now</div>
      <h3>Learner Explorer</h3>
      <div class="price">$0 <span>/ forever</span></div>
      <p class="tier-desc">Everything the Academy has actually published: the full written curriculum, and the schema checkpoint that grades your answer in the browser.</p>
      <ul>
        <li>✓ All seven curriculum and strategy documents, in full</li>
        <li>✓ The mastery checkpoint grader on the sandbox page</li>
        <li>✓ The agent-loop walkthrough for all three project tracks</li>
      </ul>
      <p class="tier-planned-label">Designed, not yet built:</p>
      <ul class="tier-planned">
        <li>◦ Per-project specifications as separate artifacts</li>
        <li>◦ The engineering knowledge graph (designed in doc 02)</li>
        <li>◦ Public portfolio page hosting</li>
        <li>◦ Community forums and peer review</li>
      </ul>
      <a href="index.html" class="btn btn-secondary btn-block">Read the free curriculum</a>
    </div>

    <div class="pricing-card featured">
      <div class="card-badge badge-planned">Not yet available</div>
      <h3>Pro Learner ($49/mo)</h3>
      <div class="price">$49 <span>/ month</span></div>
      <p class="tier-desc">The tier we are validating. None of it is built yet; the waitlist is how you tell us it is worth building.</p>
      <p class="tier-planned-label">Planned:</p>
      <ul class="tier-planned">
        <li>◦ Everything in the free tier</li>
        <li>◦ Interactive sandbox runtimes that actually execute</li>
        <li>◦ An AI engineering mentor for code and architecture review</li>
        <li>◦ Automated mastery checkpoints and badging</li>
        <li>◦ A private mentor channel</li>
      </ul>
      <button class="btn btn-primary btn-block" onclick="openWaitlistModal()">Join the $49/mo Pro waitlist</button>
    </div>

    <div class="pricing-card">
      <div class="card-badge badge-planned">Not yet available</div>
      <h3>Employer Sponsored</h3>
      <div class="price">Custom <span>/ seat</span></div>
      <p class="tier-desc">For engineering teams upskilling in AI agent architecture and hardware-software integration. Scoped per team; no rate card exists yet.</p>
      <p class="tier-planned-label">Planned:</p>
      <ul class="tier-planned">
        <li>◦ Everything in the Pro tier</li>
        <li>◦ A cohort dashboard</li>
        <li>◦ Custom enterprise project tracks</li>
        <li>◦ Introductions to hiring teams</li>
      </ul>
      <button class="btn btn-outline btn-block" onclick="openWaitlistModal('team')">Talk to us about a team</button>
    </div>
  </div>

  <div class="calculator-section">
    <h2>🧮 Work out what this would need to be worth</h2>
    <p>
      A sum you drive, not a claim we make. Set all four numbers — including the
      two rates — and the arithmetic below is your own.
    </p>
    <p class="calc-caveat">
      <strong>The two rates start as placeholders, not quoted prices.</strong>
      We have not metered a sandbox hour, because the sandbox does not exist
      yet, and mentor pricing depends on a model and a context size we have not
      fixed. Replace both with figures from your own provider's published price
      list before you read anything into the total.
    </p>

    <div class="calc-box">
      <div class="calc-row">
        <label for="hours-slider">Sandbox hours you would use per month:</label>
        <input type="range" id="hours-slider" min="5" max="100" value="25" oninput="updateCalc()" />
        <span id="hours-val">25 hours</span>
      </div>

      <div class="calc-row">
        <label for="hour-rate">Your assumed cost per sandbox hour ($):</label>
        <input type="number" id="hour-rate" min="0" step="0.05" value="1.50" oninput="updateCalc()" />
      </div>

      <div class="calc-row">
        <label for="queries-slider">Mentor queries you would send per month:</label>
        <input type="range" id="queries-slider" min="50" max="1000" value="300" oninput="updateCalc()" />
        <span id="queries-val">300 queries</span>
      </div>

      <div class="calc-row">
        <label for="query-rate">Your assumed cost per mentor query ($):</label>
        <input type="number" id="query-rate" min="0" step="0.01" value="0.35" oninput="updateCalc()" />
      </div>

      <div class="calc-result">
        <div class="result-item">
          <span>Your usage at the rates you entered:</span>
          <strong id="retail-val">$142.50 / mo</strong>
        </div>
        <div class="result-item highlight">
          <span>The $49/mo price we are testing:</span>
          <strong>$49.00 / mo</strong>
        </div>
        <div class="result-item success">
          <span id="difference-label">Difference at your rates:</span>
          <strong id="savings-val">$93.50 / mo cheaper</strong>
        </div>
      </div>
    </div>
  </div>

  <!-- Waitlist Modal -->
  <div id="waitlist-modal" class="modal-overlay" style="display:none;">
    <div class="modal-card">
      <span class="modal-close" onclick="closeWaitlistModal()">&times;</span>
      <h3 id="waitlist-heading">Join the Pro tier waitlist</h3>
      <p id="waitlist-intro">Tell us the $49/mo tier is worth building, and we will come back to you when there is something to try. Nothing is charged and no account is created.</p>
      
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
  var PRO_PRICE = 49.00;

  function readNumber(id, fallback) {
    var raw = parseFloat(document.getElementById(id).value);
    return isFinite(raw) && raw >= 0 ? raw : fallback;
  }

  function updateCalc() {
    var hours = readNumber('hours-slider', 0);
    var queries = readNumber('queries-slider', 0);
    var hourRate = readNumber('hour-rate', 0);
    var queryRate = readNumber('query-rate', 0);

    document.getElementById('hours-val').innerText = hours + ' hours';
    document.getElementById('queries-val').innerText = queries + ' queries';

    var usageCost = (hours * hourRate) + (queries * queryRate);
    // Report both directions. The previous version floored this at zero, so
    // every set of inputs where the subscription was the more expensive option
    // still displayed a saving.
    var difference = usageCost - PRO_PRICE;

    document.getElementById('retail-val').innerText = '$' + usageCost.toFixed(2) + ' / mo';
    document.getElementById('difference-label').innerText =
      difference >= 0 ? 'Subscription is cheaper by:' : 'Subscription is more expensive by:';
    document.getElementById('savings-val').innerText =
      '$' + Math.abs(difference).toFixed(2) + ' / mo';
  }

  // The team button used to open the Pro tier's form verbatim, so a team lead
  // asking about seats was shown a $49/mo individual signup. Both still route
  // to the same address; the copy now says which one you pressed.
  function openWaitlistModal(type) {
    var isTeam = type === 'team';
    document.getElementById('waitlist-heading').innerText =
      isTeam ? 'Talk to us about a team' : 'Join the Pro tier waitlist';
    document.getElementById('waitlist-intro').innerText = isTeam
      ? 'Team pricing is scoped per team and no rate card exists yet. Tell us the size and shape of your team and we will reply with what we can offer.'
      : 'Tell us the $49/mo tier is worth building, and we will come back to you when there is something to try. Nothing is charged and no account is created.';
    document.getElementById('waitlist-modal').setAttribute('data-waitlist-type', isTeam ? 'team' : 'pro');
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

    var isTeam =
      document.getElementById('waitlist-modal').getAttribute('data-waitlist-type') === 'team';

    // The two sliders are the only place a visitor states what they expect to
    // use, and $49 is a proposal with nothing behind it. Carrying the stated
    // usage into the application is what turns the estimator from decoration
    // into the demand data the price needs.
    var hours = readNumber('hours-slider', 0);
    var queries = readNumber('queries-slider', 0);

    var body = 'Name: ' + name + '\\n'
      + 'Email: ' + email + '\\n'
      + 'Track: ' + track + '\\n'
      + 'Enquiry: ' + (isTeam ? 'Team / employer-sponsored seats' : 'Individual Pro tier') + '\\n'
      + 'Expected sandbox hours per month: ' + hours + '\\n'
      + 'Expected mentor questions per month: ' + queries + '\\n';

    var href = 'mailto:${WAITLIST_CONTACT}'
      + '?subject=' + encodeURIComponent(
          (isTeam ? 'Team access enquiry - ' : 'Pro Tier waitlist application - ') + name
        )
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
    // The two custom pages lay out a card grid and a console, which do not fit
    // the prose measure the markdown pages are set to.
    wide: Boolean(page.custom),
  });

  writeFileSync(join(DIST, page.out), html, "utf8");
  console.log(`built ${page.out}`);
}

copyFileSync(join(__dirname, "style.css"), join(DIST, "style.css"));
console.log(`\nDone. Open ${join(DIST, "index.html")}`);

