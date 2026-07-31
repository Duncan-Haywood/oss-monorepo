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

// Spec Detail Data
const specsData = {
  pairwise: {
    title: 'Pairwise Engine',
    desc: 'Psychometric Preference & Relationship Alignment Engine',
    details: `
      <ul style="margin-top: 12px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
        <li>• <strong>Algorithm:</strong> Glicko-2 chess rating algorithm for discrete items</li>
        <li>• <strong>Econometrics:</strong> Davidson tie-extended Bradley-Terry logit models for continuous attributes</li>
        <li>• <strong>3 Perspectives:</strong> Personal preference, partner desired, guess of partner desire</li>
        <li>• <strong>Output:</strong> Uncovers relationship blind spots, shared ground, and high-confidence actionable insights</li>
        <li>• <strong>Deployment:</strong> Next.js 16 + Prisma PostgreSQL on K3s Kubernetes</li>
      </ul>
    `
  },
  academy: {
    title: 'AI Engineering Academy',
    desc: 'Autonomous Agent Architecture Sandbox',
    details: `
      <ul style="margin-top: 12px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
        <li>• <strong>Focus:</strong> Multi-agent systems, tool calling, and RAG optimization</li>
        <li>• <strong>Stack:</strong> Python, LangGraph, FastAPI, Next.js</li>
        <li>• <strong>Environment:</strong> Isolated container sandboxes with real-time execution logs</li>
      </ul>
    `
  },
  realestate: {
    title: 'Real Estate Photo Suite',
    desc: 'Computer Vision & HDR Property Presentation',
    details: `
      <ul style="margin-top: 12px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
        <li>• <strong>Focus:</strong> Automated tone-mapping, window pull, and deskewing</li>
        <li>• <strong>Pipeline:</strong> OpenCV & PyTorch batch processing microservices</li>
      </ul>
    `
  },
  sitestudio: {
    title: 'Local Site Studio',
    desc: 'Automated Local Business Studio',
    details: `
      <ul style="margin-top: 12px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
        <li>• <strong>Focus:</strong> Instant high-converting local service storefronts</li>
        <li>• <strong>Performance:</strong> 100/100 Google Lighthouse Core Web Vitals score</li>
      </ul>
    `
  },
  retail: {
    title: 'Retail Pilot Intel',
    desc: 'Real-Time Inventory & Foot-Traffic Analytics',
    details: `
      <ul style="margin-top: 12px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
        <li>• <strong>Focus:</strong> Sub-second streaming telemetry and predictive restocking</li>
        <li>• <strong>Backend:</strong> High-throughput Go services with TimescaleDB</li>
      </ul>
    `
  },
  print: {
    title: 'Print Atelier',
    desc: 'Fine Art Digital Processing & Print Studio',
    details: `
      <ul style="margin-top: 12px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
        <li>• <strong>Focus:</strong> WebAssembly-based client-side color profile management</li>
        <li>• <strong>Target:</strong> Photographers and digital art print shops</li>
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
