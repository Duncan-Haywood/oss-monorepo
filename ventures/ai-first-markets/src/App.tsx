import "./App.css";

const NAV_LINKS = [
  { href: "#thesis", label: "Thesis" },
  { href: "#ripe", label: "Ripe Criteria" },
  { href: "#tiers", label: "Market Tiers" },
  { href: "#compare", label: "Compare" },
  { href: "#picks", label: "Top Picks" },
  { href: "#wedge", label: "Wedge Filter" },
  { href: "#patterns", label: "Patterns" },
];

const RIPENESS_CRITERIA = [
  {
    title: "High labor cost, low software leverage",
    desc: "Work is expensive but still done manually — software hasn't meaningfully replaced headcount.",
  },
  {
    title: "Messy unstructured inputs",
    desc: "PDFs, emails, calls, spreadsheets — the raw material AI is built to parse and organize.",
  },
  {
    title: "Rules + judgment",
    desc: "AI drafts, classifies, and reconciles; a human approves the final call. Perfect human-in-the-loop fit.",
  },
  {
    title: "Fragmented buyers",
    desc: "Many SMB and mid-market firms — no single buyer blocks the market, and pain is widespread.",
  },
  {
    title: "Legacy software = filing, not workflow",
    desc: "Incumbents digitized records but didn't automate the actual work. Greenfield for workflow AI.",
  },
  {
    title: "Clear ROI",
    desc: "30–70% time savings on core tasks — easy to quantify and sell on outcomes, not features.",
  },
  {
    title: "Distribution wedge",
    desc: "Accountants, brokers, agencies, MSPs — trusted channels that already reach your buyer.",
  },
];

const TIER_1 = [
  {
    title: "Accounting / Bookkeeping / Tax",
    items: [
      "AI bookkeeper",
      "Tax copilot",
      "AP/AR automation",
      "Month-end close",
      "Vertical bookkeeping (e.g. restaurants, e-commerce)",
    ],
  },
  {
    title: "Insurance",
    items: ["Brokers & MGAs", "Claims processing", "Policy intake & renewal"],
  },
  {
    title: "Legal Ops",
    items: ["Contract review", "Client intake", "Compliance monitoring"],
  },
  {
    title: "Healthcare Admin",
    items: ["Revenue cycle", "Prior auth", "Denials management"],
  },
  {
    title: "Staffing / Recruiting / HR Ops",
    items: ["Candidate screening", "Onboarding workflows", "Benefits admin"],
  },
  {
    title: "Commercial RE / Property Mgmt",
    items: ["Lease abstraction", "Tenant communications", "Maintenance coordination"],
  },
];

const TIER_2 = [
  {
    title: "Traditional Digital Services",
    items: [
      "Productized service models",
      "Vertical workflow software",
      "Internal copilots — attack workflow, not category",
    ],
  },
  {
    title: "Marketing / Sales Ops",
    items: ["Campaign ops", "Lead enrichment", "CRM hygiene automation"],
  },
  {
    title: "Customer Support / BPO",
    items: ["Tier-1 resolution", "Knowledge base ops", "Vertical BPO replacement"],
  },
];

const TIER_3 = [
  {
    title: "SMB Banking / Lending",
    items: ["Loan origination", "Underwriting support", "Compliance docs"],
  },
  {
    title: "Government / Compliance",
    items: ["Permit processing", "Audit prep", "Regulatory filing"],
  },
  {
    title: "Construction / Field Services",
    items: ["Estimating", "Scheduling", "Back-office for trades"],
  },
];

const COMPARISON_ROWS = [
  {
    dimension: "Pain level",
    accounting: "Very high",
    digital: "Medium",
  },
  {
    dimension: "Repetition",
    accounting: "Very high",
    digital: "Medium",
  },
  {
    dimension: "AI fit",
    accounting: "Excellent",
    digital: "Good (internal ops)",
  },
  {
    dimension: "Willingness to pay",
    accounting: "High",
    digital: "Often low (hourly mindset)",
  },
  {
    dimension: "Incumbent weakness",
    accounting: "Systems of record, not workflow",
    digital: "Category incumbents exist",
  },
  {
    dimension: "Best strategy",
    accounting: "Vertical AI operator + accountant channel",
    digital: "Productized vertical workflow",
  },
];

const TOP_PICKS = [
  {
    title: "AI back-office for SMBs",
    desc: "Broad wedge across bookkeeping, AP/AR, and close — highest ROI density.",
  },
  {
    title: "Insurance broker & claims automation",
    desc: "Fragmented market, messy inputs, clear channel via brokers and MGAs.",
  },
  {
    title: "Legal ops for SMB / mid-market",
    desc: "Contract review and intake at scale — rules + judgment playbook.",
  },
  {
    title: "Healthcare admin wedge",
    desc: "Revenue cycle and prior auth — painful, regulated, high labor cost.",
  },
  {
    title: "Construction / trades back office",
    desc: "Underserved, fragmented, legacy tools — Tier 3 but large TAM.",
  },
  {
    title: "Vertical BPO replacement",
    desc: "Replace outsourced labor with AI + small human team per vertical.",
  },
];

const WEDGE_FILTERS = [
  "Who buys software (not just services)?",
  "Who feels the pain daily?",
  "How long is the sales cycle?",
  "Is a channel available (accountants, brokers, agencies)?",
];

const PATTERNS_WIN = [
  "AI employee — not assistant, not chatbot",
  "Vertical, not horizontal",
  "Workflow replacement, not feature add-on",
  "Human-in-the-loop by design",
  "Outcome pricing ($/month saved, not per seat)",
];

const PATTERNS_AVOID = [
  "Generic AI assistant",
  "Horizontal copilots",
  "10% cheaper labor markets (no margin for software)",
  "Incumbents with good-enough AI roadmaps",
];

function Nav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="#" className="nav-brand">
          AI-First <span>Markets</span>
        </a>
        <div className="nav-links">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

function App() {
  return (
    <div className="app">
      <Nav />

      <header className="hero" id="thesis">
        <div className="container">
          <div className="hero-badge">2025–2026 Opportunity Map</div>
          <h1>
            Target markets where work is <em>labor</em>, not paper
          </h1>
          <p className="hero-thesis">
            The best AI-first opportunities aren't industries drowning in documents —
            they're industries where work is repetitive, judgment-heavy, fragmented,
            and still sold as labor. Software replaces the workflow, not the filing
            cabinet.
          </p>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-value">7</span>
              <span className="hero-stat-label">Ripeness criteria</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-value">30–70%</span>
              <span className="hero-stat-label">Typical time savings</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-value">60/40</span>
              <span className="hero-stat-label">AI drafts · human approves</span>
            </div>
          </div>
        </div>
      </header>

      <section className="section" id="ripe">
        <div className="container">
          <div className="section-header">
            <span className="section-label">Framework</span>
            <h2 className="section-title">What makes a market "ripe"</h2>
            <p className="section-desc">
              Score any vertical against these seven signals. More checks = better
              fit for an AI-first, software-first business model.
            </p>
          </div>

          <div className="criteria-grid">
            {RIPENESS_CRITERIA.map((item, i) => (
              <article key={item.title} className="criteria-card">
                <div className="criteria-num">{i + 1}</div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>

          <div className="framework-diagram">
            <h3>The AI-first workflow loop</h3>
            <div className="flow">
              <div className="flow-row">
                <div className="flow-node input">Messy inputs</div>
                <span className="flow-arrow">→</span>
                <div className="flow-node ai">AI processes (60%)</div>
                <span className="flow-arrow">→</span>
                <div className="flow-node human">Human approves (40%)</div>
                <span className="flow-arrow">→</span>
                <div className="flow-node outcome">Outcome delivered</div>
              </div>
              <p className="flow-caption">
                PDFs, emails, calls, and spreadsheets in — reconciled drafts,
                classifications, and recommendations out. Human judgment on the
                exceptions, not the routine.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="tiers" style={{ background: "var(--bg-muted)" }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">Market map</span>
            <h2 className="section-title">Three tiers of opportunity</h2>
            <p className="section-desc">
              Tier 1 markets are ready now. Tier 2 needs a sharper wedge. Tier 3
              is structurally attractive but harder to execute.
            </p>
          </div>

          <div className="tier-block">
            <div className="tier-header">
              <span className="tier-badge t1">Tier 1</span>
              <h3>Very ripe</h3>
            </div>
            <div className="market-cards">
              {TIER_1.map((market) => (
                <article key={market.title} className="market-card">
                  <h4>{market.title}</h4>
                  <ul>
                    {market.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>

          <div className="tier-block">
            <div className="tier-header">
              <span className="tier-badge t2">Tier 2</span>
              <h3>Ripe but competitive</h3>
            </div>
            <p className="tier-note">
              Attack workflow, not category. Differentiate on vertical depth or
              productized delivery.
            </p>
            <div className="market-cards">
              {TIER_2.map((market) => (
                <article key={market.title} className="market-card">
                  <h4>{market.title}</h4>
                  <ul>
                    {market.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>

          <div className="tier-block">
            <div className="tier-header">
              <span className="tier-badge t3">Tier 3</span>
              <h3>Structurally ripe, harder execution</h3>
            </div>
            <p className="tier-note">
              Long sales cycles, regulation, or operational complexity — but large
              TAM if you break through.
            </p>
            <div className="market-cards">
              {TIER_3.map((market) => (
                <article key={market.title} className="market-card">
                  <h4>{market.title}</h4>
                  <ul>
                    {market.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="compare">
        <div className="container">
          <div className="section-header">
            <span className="section-label">Strategic fork</span>
            <h2 className="section-title">Accounting vs. digital services</h2>
            <p className="section-desc">
              Two common starting points — one is the better default, the other
              works as channel or productized wedge.
            </p>
          </div>

          <div className="table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Dimension</th>
                  <th className="highlight">Accounting</th>
                  <th>Digital services</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.dimension}>
                    <td>{row.dimension}</td>
                    <td className="highlight">{row.accounting}</td>
                    <td className="muted">{row.digital}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="conclusion-box">
            <strong>Conclusion:</strong> Accounting is the better default — higher
            pain, higher WTP, weaker incumbents on workflow. Digital services work
            better as a channel play or productized vertical wedge, not as a
            horizontal AI bet.
          </div>
        </div>
      </section>

      <section className="section" id="picks" style={{ background: "var(--bg-muted)" }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">Priority stack</span>
            <h2 className="section-title">Where to look first (2025–2026)</h2>
            <p className="section-desc">
              Ranked by ripeness, wedge clarity, and near-term buildability.
            </p>
          </div>

          <ol className="ranked-list">
            {TOP_PICKS.map((pick, i) => (
              <li key={pick.title} className="ranked-item">
                <span className={`rank-num ${i < 3 ? "top" : ""}`}>{i + 1}</span>
                <div className="ranked-content">
                  <h4>{pick.title}</h4>
                  <p>{pick.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" id="wedge">
        <div className="container">
          <div className="section-header">
            <span className="section-label">Decision filter</span>
            <h2 className="section-title">How to pick your wedge</h2>
            <p className="section-desc">
              Run every idea through this gate before committing engineering time.
            </p>
          </div>

          <div className="wedge-box">
            <p className="wedge-question">
              "Can AI do 60% of the work from messy inputs, with a human approving
              the last 40%, saving $2k+ per month?"
            </p>
            <div className="filter-grid">
              {WEDGE_FILTERS.map((filter) => (
                <div key={filter} className="filter-item">
                  <div className="filter-check" aria-hidden="true" />
                  <span>{filter}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="patterns">
        <div className="container">
          <div className="section-header">
            <span className="section-label">Playbook</span>
            <h2 className="section-title">Patterns that win — and what to avoid</h2>
          </div>

          <div className="two-col">
            <div className="pattern-panel win">
              <h3>Patterns that win</h3>
              <ul className="pattern-list">
                {PATTERNS_WIN.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="pattern-panel avoid">
              <h3>What to avoid</h3>
              <ul className="pattern-list">
                {PATTERNS_AVOID.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <p>AI-First Markets · Opportunity analysis digest</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
