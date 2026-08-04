// Maris Stella Labs Homepage Interaction Script

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
  if (event.key === 'Escape') closeModal();
});
