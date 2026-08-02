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
  { custom: true, out: "sandbox.html", nav: "⚡ Agent Walkthroughs", title: "Annotated AI Agent Walkthroughs" },
  { custom: true, out: "pricing.html", nav: "💎 Pricing", title: "Pricing & Membership Hypothesis" },
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
<body${wide ? ' class="wide"' : ""}>
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

// The three walkthrough tracks. Each `trace` is an authored teaching example
// written by hand — NOT a captured log and NOT the output of running anything.
// The page must keep saying so. Two earlier versions of this page presented a
// fixed transcript as though it were executing the visitor's own prompt: it
// printed "12/12 passing" and "Subgoal satisfaction score: 100%" for any input,
// including an empty one. Do not reintroduce a control that implies the browser
// ran the visitor's prompt until something actually executes it.
const SANDBOX_TRACKS = [
  {
    key: "tool-calling",
    button: "🤖 Track 1: Multi-Agent Tool Calling",
    title: "Track 1: Multi-Agent Tool Calling & Orchestration",
    desc: "Build an agent pipeline with a Planner, Executor, and Evaluator. The agent receives a high-level goal, inspects the tools available to it, and executes a multi-step plan.",
    prompt: "Find the failing integration tests in this repo, git blame the affected modules, and draft a patch.",
    trace: [
      "[Planner] Goal received. Decomposing into ordered subgoals:",
      "           1. locate the test files  2. run them  3. attribute failures  4. draft a patch",
      "[Planner] Checking the tool registry for something that can list files... found list_files.",
      "[Executor] list_files(pattern=\"*.test.ts\") -> 14 paths",
      "[Executor] run_tests(paths=[...]) -> 12 passed, 2 failed",
      "[Evaluator] Subgoal 2 satisfied. Two failures is a result, not an error - continue.",
      "[Executor] git_blame(file=\"checkout.test.ts\", lines=\"88-96\") -> commit 4f1a2c",
      "[Evaluator] Subgoal 3 satisfied. Handing the attributed failure to the patch step.",
      "",
      "What to notice: the Evaluator does not treat a failing test as the agent",
      "failing. Conflating the two is the single most common bug in a first",
      "agent loop - it makes the agent retry work that already succeeded.",
    ],
  },
  {
    key: "autonomous-debug",
    button: "🔄 Track 2: Autonomous Debugging Loop",
    title: "Track 2: Autonomous Debugging Loop",
    desc: "Construct a self-healing loop: the agent catches a runtime stack trace, inspects local state, forms a patch hypothesis, runs the tests, and iterates.",
    prompt: "Fix the RenderFlex overflow in the header component at mobile viewport widths.",
    trace: [
      "[Observer] Caught: RenderFlex overflowed by 42 px on the right.",
      "[Observer] Captured frame state: viewport=375x812, header children=3.",
      "[Hypothesis] The title Text has no width constraint, so it cannot shrink.",
      "[Patch] Wrap the Text in Expanded, add overflow: TextOverflow.ellipsis.",
      "[Executor] run_tests(suite=\"header\") -> 1 failed (golden image differs)",
      "[Evaluator] Hypothesis partly wrong: overflow is gone, layout shifted.",
      "[Hypothesis 2] Expanded took the free space. Use Flexible instead.",
      "[Executor] run_tests(suite=\"header\") -> 6 passed",
      "[Evaluator] Converged after 2 iterations.",
      "",
      "What to notice: the first patch was wrong and the loop kept going. A",
      "debugging agent that cannot record a rejected hypothesis will propose",
      "the same fix forever.",
    ],
  },
  {
    key: "pid-controller",
    button: "🎛️ Track 3: Hardware PID Controller",
    title: "Track 3: Hardware PID Temperature Controller",
    desc: "Work through an embedded control loop driving a thermal chamber: tune Kp, Ki and Kd, and read the trade-off between overshoot and settling time.",
    prompt: "Tune the PID constants for a target temperature of 85 °C.",
    trace: [
      "[Setup] Target 85.0 C, ambient 21.0 C, heater 40 W, chamber 0.9 kg alu.",
      "[Run 1] Kp=8.0  Ki=0.00 Kd=0.0 -> settles at 78.4 C. Steady-state error.",
      "[Note ] Proportional-only control cannot remove steady-state error: at",
      "        the target the error is zero, so the output is zero.",
      "[Run 2] Kp=8.0  Ki=0.15 Kd=0.0 -> reaches 85.0 C, overshoots to 94.1 C.",
      "[Note ] The integral term accumulated during the long climb. That stored",
      "        error is what pushes it past the target - integral windup.",
      "[Run 3] Kp=8.0  Ki=0.15 Kd=1.2 -> peak 86.8 C, settles 85.0 C in 240 s.",
      "",
      "What to notice: each term was added to fix a named, observed defect.",
      "Tuning all three at once teaches nothing about which one is doing what.",
    ],
  },
];

function getSandboxBodyHtml() {
  const trackButtons = SANDBOX_TRACKS.map(
    (t, i) =>
      `<button class="track-btn${i === 0 ? " active" : ""}" data-track="${t.key}" onclick="switchTrack(this)">${t.button}</button>`
  ).join("\n      ");

  return `
  <h1>⚡ AI Agent & Multi-Tool Walkthroughs</h1>
  <p class="subtitle">Read an annotated agent loop step by step: how a planner decomposes a goal, why an evaluator must separate "the test failed" from "the agent failed", and where a control loop actually goes wrong.</p>

  <div class="notice">
    <strong>These are authored walkthroughs, not a live sandbox.</strong>
    Every trace below was written by hand to teach one specific idea. Nothing on
    this page executes code, calls a model, or runs your input. The executable
    sandbox is part of the paid tier described on the
    <a href="pricing.html">pricing page</a> — a hypothesis we are still testing,
    not a product you can use today.
  </div>

  <div class="sandbox-card">
    <div class="track-selector">
      ${trackButtons}
    </div>

    <div id="track-content" class="track-panel">
      <div class="panel-header">
        <h3 id="track-title">${SANDBOX_TRACKS[0].title}</h3>
        <span class="badge">Authored walkthrough</span>
      </div>
      <p id="track-desc">${SANDBOX_TRACKS[0].desc}</p>

      <div class="interactive-controls">
        <label for="user-prompt"><strong>The goal this walkthrough works from:</strong></label>
        <textarea id="user-prompt" rows="2" readonly aria-readonly="true">${SANDBOX_TRACKS[0].prompt}</textarea>
        <p class="field-note">Read-only: the trace below is written against this
        goal. Editing it would not change the trace, so the page does not pretend
        that it can.</p>

        <div class="button-group">
          <button id="run-sandbox-btn" class="btn btn-primary" onclick="showWalkthrough()">▶ Step through the walkthrough</button>
          <button class="btn btn-secondary" onclick="resetSandboxLogs()">🧹 Clear</button>
        </div>
      </div>

      <div class="console-box">
        <div class="console-header">
          <span>Annotated agent trace (authored example)</span>
          <span class="console-status" id="console-status">READY</span>
        </div>
        <pre id="console-output"><code>Pick a track above, then choose "Step through the walkthrough".</code></pre>
      </div>

      <div class="mastery-checkpoint">
        <h4>🎯 Mastery checkpoint</h4>
        <p>Write the JSON schema for a database search tool that cannot be used to
        inject SQL — the table should be a fixed set of allowed values rather than
        free text. Your answer is checked in your browser and is not sent anywhere.</p>
        <div class="checkpoint-input-row">
          <textarea id="checkpoint-answer" rows="6" placeholder='{"type": "object", "properties": {"table": {"enum": ["orders"]}}, "required": ["table"]}'></textarea>
          <button class="btn btn-accent" onclick="verifyCheckpoint()">Check my schema</button>
        </div>
        <div id="checkpoint-feedback" role="status" aria-live="polite"></div>
      </div>
    </div>
  </div>

  <script>
  var TRACKS = ${JSON.stringify(
    Object.fromEntries(
      SANDBOX_TRACKS.map((t) => [
        t.key,
        { title: t.title, desc: t.desc, prompt: t.prompt, trace: t.trace },
      ])
    )
  )};

  var currentTrack = ${JSON.stringify(SANDBOX_TRACKS[0].key)};

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function switchTrack(btn) {
    var key = btn.getAttribute('data-track');
    currentTrack = key;
    var track = TRACKS[key];

    var buttons = document.querySelectorAll('.track-btn');
    for (var i = 0; i < buttons.length; i++) buttons[i].classList.remove('active');
    btn.classList.add('active');

    document.getElementById('track-title').innerText = track.title;
    document.getElementById('track-desc').innerText = track.desc;
    document.getElementById('user-prompt').value = track.prompt;
    document.getElementById('console-output').innerHTML =
      '<code>Track switched. Choose "Step through the walkthrough" to read the trace.</code>';
    document.getElementById('console-status').innerText = 'READY';
  }

  function showWalkthrough() {
    var track = TRACKS[currentTrack];
    document.getElementById('console-output').innerHTML =
      '<code>' + escapeHtml(track.trace.join('\\n')) + '</code>';
    document.getElementById('console-status').innerText = 'AUTHORED EXAMPLE';
  }

  function resetSandboxLogs() {
    document.getElementById('console-output').innerHTML =
      '<code>Cleared. Choose "Step through the walkthrough" to read the trace again.</code>';
    document.getElementById('console-status').innerText = 'READY';
  }

  // Really parses and inspects the submitted schema. An earlier version passed
  // any input longer than ten characters and replied "Schema structure
  // verified", which taught the visitor nothing and was untrue.
  function verifyCheckpoint() {
    var raw = document.getElementById('checkpoint-answer').value.trim();
    var feedback = document.getElementById('checkpoint-feedback');

    function fail(msg) {
      feedback.innerHTML = '<div class="alert alert-warning">⚠️ ' + escapeHtml(msg) + '</div>';
    }

    if (!raw) return fail('Enter a JSON schema to check.');

    var schema;
    try {
      schema = JSON.parse(raw);
    } catch (err) {
      return fail('That is not valid JSON: ' + err.message);
    }

    if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
      return fail('A tool schema must be a JSON object.');
    }
    if (schema.type !== 'object') {
      return fail('The top level needs "type": "object" - a tool call takes named arguments.');
    }
    var props = schema.properties;
    if (props === null || typeof props !== 'object' || Array.isArray(props)) {
      return fail('Add a "properties" object describing each argument.');
    }
    var names = Object.keys(props);
    if (names.length === 0) {
      return fail('"properties" is empty, so the tool takes no arguments.');
    }

    // The actual point of the exercise: is any argument constrained to a fixed
    // set of values, rather than accepting arbitrary text?
    var constrained = names.filter(function (n) {
      var p = props[n];
      if (p === null || typeof p !== 'object') return false;
      return Array.isArray(p.enum) && p.enum.length > 0;
    });

    var notes = [];
    notes.push('Parsed a schema with ' + names.length + ' argument(s): ' + names.join(', ') + '.');

    if (constrained.length === 0) {
      notes.push('No argument is restricted to a fixed set of values. If the table '
        + 'or column name arrives as free text, the caller chooses it - that is the '
        + 'injection route. Constrain it with "enum".');
      return fail(notes.join(' '));
    }

    notes.push('Constrained by "enum": ' + constrained.join(', ') + '. '
      + 'That is the property that matters here - those arguments cannot carry '
      + 'arbitrary SQL because only listed values validate.');

    if (!Array.isArray(schema.required) || schema.required.length === 0) {
      notes.push('Worth adding: no argument is listed in "required", so a caller '
        + 'may omit them all.');
    }

    feedback.innerHTML = '<div class="alert alert-success">✅ ' + escapeHtml(notes.join(' ')) + '</div>';
  }
  </script>
  `;
}

function getPricingBodyHtml() {
  return `
  <h1>💎 Pricing</h1>
  <p class="subtitle">The principle this is built on: <strong>free knowledge, paid compute.</strong> Anything that costs us nothing to serve one more learner stays free. The paid tier exists to cover the things that cost real money per learner — model tokens, simulation compute, hardware — plus a modest margin.</p>

  <div class="notice">
    <strong>Nothing on this page can be bought yet, and the $49 is a proposal.</strong>
    This venture is at prototype stage. The paid tier below is not built, no one
    has ever been charged, and the price is an untested hypothesis we are
    publishing so it can be argued with. What exists today is the written
    curriculum and platform design — the documents in the sidebar — which is
    free and always will be. Everything marked <em>Planned</em> is a commitment
    we intend to keep, not a feature you would be paying for today.
  </div>

  <div class="pricing-grid">
    <div class="pricing-card">
      <div class="card-badge">Available now — free</div>
      <h3>Learner Explorer</h3>
      <div class="price">$0 <span>/ forever</span></div>
      <p class="tier-desc">Everything this project has actually published, free and without an account.</p>
      <ul>
        <li>✓ The full written curriculum and assessment model</li>
        <li>✓ The learning-science, mentor and knowledge-graph design</li>
        <li>✓ The technical architecture and business strategy in full</li>
        <li class="planned">Planned: project specifications, portfolio hosting, peer review</li>
      </ul>
      <a href="index.html" class="btn btn-secondary btn-block">Read the curriculum</a>
    </div>

    <div class="pricing-card featured">
      <div class="card-badge badge-pro">Proposed — not yet available</div>
      <h3>Pro Learner</h3>
      <div class="price">$49 <span>/ month (proposed)</span></div>
      <p class="tier-desc">The metered resources: mentor tokens, sandbox compute, and evaluation at scale. Priced to cover what they cost to serve.</p>
      <ul>
        <li class="planned">Planned: high-throughput AI mentor access</li>
        <li class="planned">Planned: executable sandbox runtimes</li>
        <li class="planned">Planned: human-reviewed mastery evaluation</li>
        <li class="planned">Planned: hardware kits at cost plus a modest margin</li>
      </ul>
      <button class="btn btn-primary btn-block" onclick="openWaitlistModal()">Join the waitlist</button>
      <p class="field-note">Joining the waitlist costs nothing, commits you to
      nothing, and takes no payment details.</p>
    </div>

    <div class="pricing-card">
      <div class="card-badge">Proposed — not yet available</div>
      <h3>Employer sponsored</h3>
      <div class="price">Undecided <span>/ seat</span></div>
      <p class="tier-desc">For teams upskilling in agent architecture and hardware-software integration. Same underlying cost basis, different purchasing relationship.</p>
      <ul>
        <li class="planned">Planned: bulk seats and cohort reporting</li>
        <li class="planned">Planned: sponsored learner places</li>
      </ul>
      <button class="btn btn-outline btn-block" onclick="openWaitlistModal('team')">Register interest</button>
    </div>
  </div>

  <div class="calculator-section">
    <h2>🧮 Tell us what you would actually use</h2>
    <p>
      We do not know yet what a month of real use looks like, and that is the
      single thing that decides whether $49 is the right number. These two
      figures go with your waitlist application so the price can be set against
      measured demand instead of a guess.
    </p>

    <div class="calc-box">
      <div class="calc-row">
        <label for="hours-slider">Sandbox hours you would expect to use per month:</label>
        <input type="range" id="hours-slider" min="5" max="100" value="25" oninput="updateCalc()" />
        <span id="hours-val">25 hours</span>
      </div>

      <div class="calc-row">
        <label for="queries-slider">AI mentor questions you would expect to ask per month:</label>
        <input type="range" id="queries-slider" min="50" max="1000" value="300" oninput="updateCalc()" />
        <span id="queries-val">300 questions</span>
      </div>

      <div class="calc-result">
        <div class="result-item">
          <span>What you told us:</span>
          <strong id="usage-summary">25 sandbox hours and 300 mentor questions a month</strong>
        </div>
        <div class="result-item highlight">
          <span>Proposed Pro price under test:</span>
          <strong>$49.00 / mo</strong>
        </div>
      </div>

      <p class="field-note">
        We are deliberately not showing you a "you save $X versus retail API
        pricing" figure. We would have to invent the comparison, and the pricing
        rule this project is built on is that a paid tier is priced to cover what
        it costs to serve plus a modest margin — not against what the same usage
        might be worth to you somewhere else. That rule is written up in
        <a href="05-business-and-strategy.html">Business &amp; Strategy</a>.
      </p>
    </div>
  </div>

  <!-- Waitlist Modal -->
  <div id="waitlist-modal" class="modal-overlay" style="display:none;">
    <div class="modal-card">
      <span class="modal-close" onclick="closeWaitlistModal()">&times;</span>
      <h3 id="waitlist-heading">Join the waitlist</h3>
      <p id="waitlist-blurb">We will email you when there is something real to
      try, and before any price is set. No payment details, no account.</p>

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
  // Reports back only the two numbers the visitor set. An earlier version
  // multiplied them by invented per-unit rates to headline a percentage saved
  // against a notional outside price. Nothing in this repository sourced those
  // rates, and the result was clamped at zero, so it could never show the case
  // where the subscription costs more than the usage is worth. Do not
  // reintroduce a comparison against an outside price without a cited, dated
  // source for it. See site/test.mjs for the contract that holds this.
  function currentUsage() {
    return {
      hours: parseInt(document.getElementById('hours-slider').value, 10),
      queries: parseInt(document.getElementById('queries-slider').value, 10)
    };
  }

  function updateCalc() {
    var usage = currentUsage();

    document.getElementById('hours-val').innerText = usage.hours + ' hours';
    document.getElementById('queries-val').innerText = usage.queries + ' questions';
    document.getElementById('usage-summary').innerText =
      usage.hours + ' sandbox hours and ' + usage.queries + ' mentor questions a month';
  }

  // The type argument used to be accepted and dropped, so a team enquiry
  // arrived looking exactly like an individual one and got the wrong reply.
  var waitlistKind = 'individual';

  function openWaitlistModal(type) {
    waitlistKind = type === 'team' ? 'team' : 'individual';
    document.getElementById('waitlist-heading').innerText =
      waitlistKind === 'team' ? 'Register team interest' : 'Join the waitlist';
    document.getElementById('waitlist-modal').style.display = 'flex';
    document.getElementById('waitlist-name').focus();
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
    var usage = currentUsage();

    var body = 'Enquiry type: ' + waitlistKind + '\\n'
      + 'Name: ' + name + '\\n'
      + 'Email: ' + email + '\\n'
      + 'Track: ' + track + '\\n'
      + 'Expected sandbox hours per month: ' + usage.hours + '\\n'
      + 'Expected mentor questions per month: ' + usage.queries + '\\n';

    var href = 'mailto:${WAITLIST_CONTACT}'
      + '?subject=' + encodeURIComponent(
          (waitlistKind === 'team' ? 'Team interest' : 'Waitlist application')
          + ' - ' + name)
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
    // The card grid and console traces need more room than the prose measure.
    wide: Boolean(page.custom),
  });

  writeFileSync(join(DIST, page.out), html, "utf8");
  console.log(`built ${page.out}`);
}

copyFileSync(join(__dirname, "style.css"), join(DIST, "style.css"));
console.log(`\nDone. Open ${join(DIST, "index.html")}`);

