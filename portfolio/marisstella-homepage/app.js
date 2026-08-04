// Maris Stella Labs Homepage Interaction Script

// Menu disclosure.
//
// Below 760px the stylesheet hides .nav-links. Until 2026-08-04 nothing
// replaced it, so on a phone the studio's only live public page offered no
// navigation and no contact route above the fold — a visitor could scroll or
// leave. This restores those destinations behind #navToggle.
document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.site-header');
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('siteNav');
  if (!header || !toggle || !nav) return;

  const navIsOpen = () => toggle.getAttribute('aria-expanded') === 'true';

  // aria-expanded is what a screen reader announces; .nav-open is what the
  // stylesheet reveals the panel with. They are written together so the panel
  // can never be on screen while assistive technology is told it is closed.
  const setNavOpen = (open) => {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      header.classList.add('nav-open');
    } else {
      header.classList.remove('nav-open');
    }
  };

  toggle.addEventListener('click', () => setNavOpen(!navIsOpen()));

  // The panel covers the top of the page, which is where an in-page link has
  // just scrolled the visitor. Left open, it hides the section they asked for.
  for (const link of nav.querySelectorAll('.nav-link')) {
    link.addEventListener('click', () => setNavOpen(false));
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !navIsOpen()) return;
    setNavOpen(false);
    // Escape dismissed the panel, so focus is inside an element that is now
    // display:none; without this it falls back to the top of the document.
    toggle.focus();
  });
});

// Filter functionality for Venture Portfolio
document.addEventListener('DOMContentLoaded', () => {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const ventureCards = document.querySelectorAll('.venture-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      filterBtns.forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      const filter = btn.getAttribute('data-filter');

      ventureCards.forEach(card => {
        if (filter === 'all') {
          card.style.display = 'flex';
        } else {
          const categories = card.getAttribute('data-category');
          if (categories && categories.includes(filter)) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
          }
        }
      });
    });
  });
});

// The control the brief was opened from, so focus can go back to it. Without
// this, dismissing a brief drops keyboard focus to the top of the document and
// the visitor has to tab through the whole page to reach the next venture.
let briefOpener = null;

// Venture brief data
const specsData = {
  pairwise: {
    title: 'Pairwise',
    desc: 'Consumer decision intelligence for couples',
    details: `
      <ul style="margin-top: 12px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
        <li><strong>Customer:</strong> Couples who want to make plans and trade-offs with less friction</li>
        <li><strong>Problem:</strong> Important preferences often stay implicit until they create conflict</li>
        <li><strong>Product:</strong> Fast pairwise choices reveal priorities, shared ground, and blind spots</li>
        <li><strong>Stage:</strong> Live product with active market learning</li>
      </ul>
    `
  },
  academy: {
    title: 'AI Engineering Academy',
    desc: 'Practical AI capability for technical teams',
    details: `
      <ul style="margin-top: 12px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
        <li><strong>Customer:</strong> Software teams moving from AI experiments to dependable products</li>
        <li><strong>Problem:</strong> Existing training rarely reflects real production constraints</li>
        <li><strong>Product:</strong> Guided curriculum, realistic practice, and immediate technical feedback</li>
        <li><strong>Stage:</strong> Private beta</li>
      </ul>
    `
  },
  realestate: {
    title: 'Real Estate Photo Suite',
    desc: 'Faster listing-ready imagery for property professionals',
    details: `
      <ul style="margin-top: 12px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
        <li><strong>Customer:</strong> Independent agents, teams, and property marketers</li>
        <li><strong>Problem:</strong> Professional listing imagery is slow and expensive to produce</li>
        <li><strong>Product:</strong> Consistent enhancement and delivery through an agent-friendly workflow</li>
        <li><strong>Stage:</strong> Product validation</li>
      </ul>
    `
  },
  sitestudio: {
    title: 'Local Site Studio',
    desc: 'Managed digital storefronts for local businesses',
    details: `
      <ul style="margin-top: 12px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
        <li><strong>Customer:</strong> Local service operators without dedicated digital teams</li>
        <li><strong>Problem:</strong> Agency-built sites are costly to launch and difficult to maintain</li>
        <li><strong>Product:</strong> A managed, conversion-focused presence built around the business</li>
        <li><strong>Stage:</strong> Venture build</li>
      </ul>
    `
  },
  retail: {
    title: 'Retail Pilot Intel',
    desc: 'Clearer operating decisions for physical retail',
    details: `
      <ul style="margin-top: 12px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
        <li><strong>Customer:</strong> Multi-location retailers and store operators</li>
        <li><strong>Problem:</strong> Demand, inventory, and staffing signals arrive too late or stay fragmented</li>
        <li><strong>Product:</strong> One operating view that surfaces the decisions needing attention</li>
        <li><strong>Stage:</strong> Pilot testing</li>
      </ul>
    `
  },
  print: {
    title: 'Print Atelier',
    desc: 'Professional print commerce for independent creators',
    details: `
      <ul style="margin-top: 12px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
        <li><strong>Customer:</strong> Artists and photographers selling premium physical work</li>
        <li><strong>Problem:</strong> Print preparation, quality control, and fulfillment remain fragmented</li>
        <li><strong>Product:</strong> A simpler path from finished digital work to a fulfilled print order</li>
        <li><strong>Stage:</strong> Venture build</li>
      </ul>
    `
  },
  markets: {
    title: 'AI-First Markets',
    desc: 'Market selection for software-native companies',
    details: `<ul><li><strong>User:</strong> Founders evaluating where AI changes industry economics</li><li><strong>Product:</strong> Comparable market maps, scored opportunities, and evidence-backed reports</li><li><strong>Stage:</strong> Research prototype; not publicly deployed</li></ul>`
  },
  shootflow: {
    title: 'ShootFlow',
    desc: 'Reliable media operations for working photographers',
    details: `<ul><li><strong>User:</strong> High-volume photographers and small studios</li><li><strong>Product:</strong> Local-first ingest, render, storage, and delivery orchestration</li><li><strong>Stage:</strong> Tested workflow prototype</li></ul>`
  },
  photoimport: {
    title: 'Photo Import Tools',
    desc: 'Verified, resumable photo-library ingestion',
    details: `<ul><li><strong>User:</strong> People managing large camera and Apple Photos libraries</li><li><strong>Product:</strong> Hash-verified offload, import monitoring, and safe recovery</li><li><strong>Stage:</strong> Tested operator utility</li></ul>`
  },
  rangecoach: {
    title: 'Range Coach',
    desc: 'Private, immediate feedback for golf practice',
    details: `<ul><li><strong>User:</strong> Recreational golfers practicing without a coach present</li><li><strong>Product:</strong> Watch motion plus fixed-camera analysis with one confidence-labelled cue</li><li><strong>Stage:</strong> Native iPhone and Apple Watch prototype</li></ul>`
  },
  analysis: {
    title: 'Real Analysis Studio',
    desc: 'Explore the structure behind rigorous proofs',
    details: `<ul><li><strong>User:</strong> Undergraduate real-analysis students</li><li><strong>Product:</strong> Interactive visual proof walkthroughs and practice</li><li><strong>Stage:</strong> Learning prototype</li></ul>`
  },
  agentserver: {
    title: 'Agent Server',
    desc: 'Isolated execution for dependable agent work',
    details: `<ul><li><strong>User:</strong> The Maris Stella studio engineering system</li><li><strong>Product:</strong> Provisioning for isolated agent execution with observable resource boundaries</li><li><strong>Stage:</strong> Infrastructure prototype; installed services remain disabled by default</li></ul>`
  }
};

function openModal(key) {
  const modal = document.getElementById('techModal');
  const title = document.getElementById('modalTitle');
  const desc = document.getElementById('modalDescription');
  const details = document.getElementById('modalDetails');

  if (specsData[key]) {
    briefOpener = document.activeElement;
    title.innerText = specsData[key].title;
    desc.innerText = specsData[key].desc;
    details.innerHTML = specsData[key].details;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    modal.querySelector('.close-modal').focus();
  }
}

function closeModal() {
  const modal = document.getElementById('techModal');
  modal.style.display = 'none';
  document.body.style.overflow = '';

  // Escape fires this on every keypress, open or not, so only restore focus
  // when a brief actually took it — otherwise a stray Escape would yank focus
  // back to a button the visitor has long since moved away from.
  if (briefOpener) {
    briefOpener.focus();
    briefOpener = null;
  }
}

window.onclick = function(event) {
  const modal = document.getElementById('techModal');
  if (event.target === modal) {
    closeModal();
  }
};

document.addEventListener('keydown', (event) => {
  const modal = document.getElementById('techModal');
  if (event.key === 'Escape') closeModal();
  if (event.key !== 'Tab' || modal.style.display !== 'flex') return;

  const focusable = Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
