/**
 * MAT 470 Real Analysis Interactive Companion App Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  // Render LaTeX math elements using KaTeX if available
  function renderMath() {
    if (window.katex) {
      document.querySelectorAll('body *:not(script):not(style)').forEach(el => {
        if (el.children.length === 0 && el.textContent.includes('$')) {
          try {
            const txt = el.textContent;
            if (txt.startsWith('$') && txt.endsWith('$')) {
              katex.render(txt.slice(1, -1), el, { throwOnError: false });
            }
          } catch (e) {}
        }
      });
    }
  }

  // --- 1. Tab Navigation System ---
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  function switchTab(targetId) {
    navButtons.forEach(btn => {
      const isTarget = btn.getAttribute('data-tab') === targetId;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    tabPanes.forEach(pane => {
      const isTarget = pane.id === targetId;
      pane.classList.toggle('active', isTarget);
    });

    // Render corresponding canvas when tab becomes active
    if (targetId === 'epsilon-section') drawEpsilonGraph();
    else if (targetId === 'sequence-section') drawSequencePlot();
    else if (targetId === 'supremum-section') drawSupremumPlot();
    else if (targetId === 'counter-section') drawPathologicalPlot();
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  // --- 2. Epsilon-Delta Sandbox ---
  const epsRange = document.getElementById('epsilon-range');
  const deltaRange = document.getElementById('delta-range');
  const epsVal = document.getElementById('epsilon-val');
  const deltaVal = document.getElementById('delta-val');
  const deltaStatusBanner = document.getElementById('delta-status-banner');
  const statusText = document.getElementById('status-text');
  const deltaFormulaDisplay = document.getElementById('delta-formula-display');
  const epsCanvas = document.getElementById('epsilon-canvas');

  let currentEpsFn = 'linear';

  const epsFunctions = {
    linear: {
      name: 'Linear: f(x) = 2x + 1',
      c: 2.0,
      L: 5.0,
      fn: x => 2 * x + 1,
      maxDelta: eps => eps / 2.0,
      formula: eps => `For f(x) = 2x+1 at c=2: max valid δ = ε / 2 = ${(eps / 2).toFixed(3)}`
    },
    quadratic: {
      name: 'Quadratic: f(x) = x²',
      c: 2.0,
      L: 4.0,
      fn: x => x * x,
      maxDelta: eps => Math.min(Math.sqrt(4 + eps) - 2, 2 - Math.sqrt(Math.max(0.1, 4 - eps))),
      formula: eps => `For f(x) = x² at c=2: max valid δ ≈ ${(Math.sqrt(4 + parseFloat(eps)) - 2).toFixed(3)}`
    },
    discontinuous: {
      name: 'Discontinuous Step',
      c: 1.0,
      L: 2.0,
      fn: x => x >= 1.0 ? 3.0 : 1.0,
      maxDelta: eps => 0.0, // No valid delta exists for limit 2
      formula: eps => `Limit does not exist at c=1! No δ > 0 can satisfy ε = ${eps}.`
    },
    sin1x: {
      name: 'Oscillating: f(x) = x sin(1/x)',
      c: 0.0,
      L: 0.0,
      fn: x => Math.abs(x) < 1e-4 ? 0 : x * Math.sin(1 / x),
      maxDelta: eps => parseFloat(eps),
      formula: eps => `Since |x sin(1/x)| ≤ |x|, max valid δ = ε = ${eps}`
    }
  };

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentEpsFn = btn.getAttribute('data-fn');
      drawEpsilonGraph();
    });
  });

  if (epsRange && deltaRange) {
    epsRange.addEventListener('input', () => {
      epsVal.textContent = parseFloat(epsRange.value).toFixed(2);
      drawEpsilonGraph();
    });
    deltaRange.addEventListener('input', () => {
      deltaVal.textContent = parseFloat(deltaRange.value).toFixed(2);
      drawEpsilonGraph();
    });
  }

  function drawEpsilonGraph() {
    if (!epsCanvas) return;
    const ctx = epsCanvas.getContext('2d');
    const width = epsCanvas.width;
    const height = epsCanvas.height;

    const eps = parseFloat(epsRange.value);
    const delta = parseFloat(deltaRange.value);
    const config = epsFunctions[currentEpsFn];

    const maxD = config.maxDelta(eps);
    const isValid = delta <= maxD && maxD > 0;

    // Update Banner UI
    if (deltaStatusBanner) {
      deltaStatusBanner.classList.toggle('invalid', !isValid);
      if (config.c === 1.0 && config.L === 2.0 && currentEpsFn === 'discontinuous') {
        statusText.textContent = `No valid δ exists! Discontinuity at c=1 prevents limit convergence.`;
      } else if (isValid) {
        statusText.textContent = `Valid δ (${delta.toFixed(2)} ≤ ${maxD.toFixed(3)}): All x in (c-δ, c+δ) land inside (L-ε, L+ε)!`;
      } else {
        statusText.textContent = `Invalid δ (${delta.toFixed(2)} > max valid ${maxD.toFixed(3)}): Some x values escape (L-ε, L+ε).`;
      }
    }

    if (deltaFormulaDisplay) {
      deltaFormulaDisplay.textContent = config.formula(eps);
    }

    // Clear Canvas
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, width, height);

    // Coordinate System Mapping
    const xMin = config.c - 2.5;
    const xMax = config.c + 2.5;
    const yMin = config.L - 3.0;
    const yMax = config.L + 3.0;

    const toScreenX = x => ((x - xMin) / (xMax - xMin)) * width;
    const toScreenY = y => height - ((y - yMin) / (yMax - yMin)) * height;

    // Draw Epsilon Tube (y-band)
    const yTop = toScreenY(config.L + eps);
    const yBot = toScreenY(config.L - eps);
    ctx.fillStyle = 'rgba(251, 113, 133, 0.15)';
    ctx.fillRect(0, yTop, width, yBot - yTop);

    ctx.strokeStyle = '#fb7185';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, yTop); ctx.lineTo(width, yTop);
    ctx.moveTo(0, yBot); ctx.lineTo(width, yBot);
    ctx.stroke();

    // Draw Delta Band (x-interval)
    const xLeft = toScreenX(config.c - delta);
    const xRight = toScreenX(config.c + delta);
    ctx.fillStyle = isValid ? 'rgba(52, 211, 153, 0.15)' : 'rgba(251, 113, 133, 0.25)';
    ctx.fillRect(xLeft, 0, xRight - xLeft, height);

    ctx.strokeStyle = isValid ? '#34d399' : '#fb7185';
    ctx.beginPath();
    ctx.moveTo(xLeft, 0); ctx.lineTo(xLeft, height);
    ctx.moveTo(xRight, 0); ctx.lineTo(xRight, height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    const originX = toScreenX(0);
    const originY = toScreenY(0);
    ctx.beginPath();
    ctx.moveTo(0, originY); ctx.lineTo(width, originY);
    ctx.moveTo(originX, 0); ctx.lineTo(originX, height);
    ctx.stroke();

    // Draw Function Curve
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let started = false;
    for (let px = 0; px <= width; px += 2) {
      const xVal = xMin + (px / width) * (xMax - xMin);
      const yVal = config.fn(xVal);
      const py = toScreenY(yVal);

      if (py >= -50 && py <= height + 50) {
        if (!started) { ctx.moveTo(px, py); started = true; }
        else { ctx.lineTo(px, py); }
      } else {
        started = false;
      }
    }
    ctx.stroke();

    // Draw Target Point (c, L)
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(toScreenX(config.c), toScreenY(config.L), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- 3. Sequence Convergence Explorer ---
  const seqCanvas = document.getElementById('sequence-canvas');
  const seqEpsRange = document.getElementById('seq-eps-range');
  const seqEpsVal = document.getElementById('seq-eps-val');
  const seqCutoffDisplay = document.getElementById('seq-cutoff-display');

  let currentSeq = 'inv_n';

  const sequences = {
    inv_n: { name: '1/n', fn: n => 1 / n, L: 0, cutoff: eps => Math.ceil(1 / eps) },
    alt_n: { name: '(-1)^n / n', fn: n => Math.pow(-1, n) / n, L: 0, cutoff: eps => Math.ceil(1 / eps) },
    rational: { name: '(2n+1)/(3n+5)', fn: n => (2*n + 1)/(3*n + 5), L: 2/3, cutoff: eps => Math.ceil((7 / (3 * eps) - 5) / 3) },
    euler: { name: '(1 + 1/n)^n', fn: n => Math.pow(1 + 1/n, n), L: Math.E, cutoff: eps => Math.ceil(Math.E / eps) },
    divergent: { name: '(-1)^n', fn: n => Math.pow(-1, n), L: null, cutoff: eps => null }
  };

  document.querySelectorAll('.seq-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seq-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSeq = btn.getAttribute('data-seq');
      drawSequencePlot();
    });
  });

  if (seqEpsRange) {
    seqEpsRange.addEventListener('input', () => {
      seqEpsVal.textContent = parseFloat(seqEpsRange.value).toFixed(2);
      drawSequencePlot();
    });
  }

  function drawSequencePlot() {
    if (!seqCanvas) return;
    const ctx = seqCanvas.getContext('2d');
    const width = seqCanvas.width;
    const height = seqCanvas.height;

    const eps = parseFloat(seqEpsRange.value);
    const seqData = sequences[currentSeq];

    const N_cutoff = seqData.cutoff(eps);

    if (seqCutoffDisplay) {
      if (seqData.L === null) {
        seqCutoffDisplay.textContent = `Sequence a_n = (-1)^n diverges! No limit L or cutoff N exists for ε = ${eps}.`;
      } else {
        const valN = Math.max(1, N_cutoff);
        seqCutoffDisplay.textContent = `For ε = ${eps.toFixed(2)}, required N = ${valN}. All terms a_${valN}, a_${valN+1}, ... lie within (L-ε, L+ε).`;
      }
    }

    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, width, height);

    const maxN = 40;
    const yMin = -0.5;
    const yMax = currentSeq === 'euler' ? 3.2 : 1.5;

    const toScreenX = n => (n / maxN) * (width - 60) + 40;
    const toScreenY = y => height - 40 - ((y - yMin) / (yMax - yMin)) * (height - 80);

    // Draw Epsilon Band if limit exists
    if (seqData.L !== null) {
      const yTop = toScreenY(seqData.L + eps);
      const yBot = toScreenY(seqData.L - eps);
      ctx.fillStyle = 'rgba(251, 113, 133, 0.15)';
      ctx.fillRect(0, yTop, width, yBot - yTop);

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, toScreenY(seqData.L)); ctx.lineTo(width, toScreenY(seqData.L));
      ctx.stroke();
    }

    // Draw Cutoff Line n = N
    if (N_cutoff && N_cutoff <= maxN) {
      const xN = toScreenX(N_cutoff);
      ctx.strokeStyle = '#818cf8';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xN, 0); ctx.lineTo(xN, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Plot Points
    for (let n = 1; n <= maxN; n++) {
      const val = seqData.fn(n);
      const px = toScreenX(n);
      const py = toScreenY(val);

      const inTube = seqData.L !== null && Math.abs(val - seqData.L) < eps;
      ctx.fillStyle = inTube ? '#34d399' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- 4. Supremum & Infimum Visualizer ---
  const supCanvas = document.getElementById('supremum-canvas');
  const boundRange = document.getElementById('bound-test-range');
  const boundTestVal = document.getElementById('bound-test-val');

  let currentSet = 'seq_set';

  const sets = {
    seq_set: { sup: 1.0, inf: 0.0, supIn: false, infIn: true, desc: 'S = {1 - 1/n}' },
    open_interval: { sup: 1.0, inf: 0.0, supIn: false, infIn: false, desc: 'S = (0, 1)' },
    sqrt2: { sup: Math.SQRT2, inf: -Math.SQRT2, supIn: false, infIn: false, desc: 'S = {x ∈ Q : x² < 2}' },
    union: { sup: 3.0, inf: 0.0, supIn: true, infIn: true, desc: 'S = [0, 1) ∪ {3}' }
  };

  document.querySelectorAll('.set-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.set-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSet = btn.getAttribute('data-set');
      drawSupremumPlot();
    });
  });

  if (boundRange) {
    boundRange.addEventListener('input', () => {
      boundTestVal.textContent = parseFloat(boundRange.value).toFixed(2);
      drawSupremumPlot();
    });
  }

  function drawSupremumPlot() {
    if (!supCanvas) return;
    const ctx = supCanvas.getContext('2d');
    const width = supCanvas.width;
    const height = supCanvas.height;

    const setData = sets[currentSet];
    const testBound = parseFloat(boundRange.value);

    // Update Details
    document.getElementById('sup-val').textContent = setData.sup.toFixed(3);
    document.getElementById('inf-val').textContent = setData.inf.toFixed(3);
    document.getElementById('sup-in-set').textContent = setData.supIn ? 'Yes (Maximum)' : 'No (LUB only)';
    document.getElementById('inf-in-set').textContent = setData.infIn ? 'Yes (Minimum)' : 'No (GLB only)';

    const isUpper = testBound >= setData.sup;
    const isLUB = Math.abs(testBound - setData.sup) < 0.01;
    const statusBox = document.getElementById('bound-status');
    const statusTxt = document.getElementById('bound-status-text');

    if (statusBox && statusTxt) {
      statusBox.className = 'status-banner ' + (isUpper ? (isLUB ? 'valid' : '') : 'invalid');
      if (isLUB) {
        statusTxt.textContent = `u = ${testBound.toFixed(2)} is the LEAST Upper Bound (Supremum)!`;
      } else if (isUpper) {
        statusTxt.textContent = `u = ${testBound.toFixed(2)} is an Upper Bound, but NOT least (since sup S = ${setData.sup.toFixed(2)} < u).`;
      } else {
        statusTxt.textContent = `u = ${testBound.toFixed(2)} is NOT an Upper Bound (elements of S exceed u).`;
      }
    }

    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, width, height);

    // Draw Number Line
    const yLine = height / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, yLine); ctx.lineTo(width - 40, yLine);
    ctx.stroke();

    const minX = -0.5;
    const maxX = 3.5;
    const toPx = x => 40 + ((x - minX) / (maxX - minX)) * (width - 80);

    // Draw Set S
    ctx.fillStyle = '#38bdf8';
    if (currentSet === 'seq_set') {
      for (let n = 1; n <= 30; n++) {
        ctx.beginPath();
        ctx.arc(toPx(1 - 1/n), yLine, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (currentSet === 'open_interval') {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(toPx(0), yLine); ctx.lineTo(toPx(1), yLine);
      ctx.stroke();
    }

    // Draw Sup line
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(toPx(setData.sup), yLine - 40); ctx.lineTo(toPx(setData.sup), yLine + 40);
    ctx.stroke();

    // Draw Test Bound
    ctx.strokeStyle = isUpper ? '#34d399' : '#fb7185';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(toPx(testBound), yLine - 60); ctx.lineTo(toPx(testBound), yLine + 60);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- 5. Interactive Proof Builder ---
  const proofSelect = document.getElementById('proof-select');
  const proofTitle = document.getElementById('proof-title');
  const proofStatement = document.getElementById('proof-statement');
  const proofStepList = document.getElementById('proof-step-list');
  const stepChoicesContainer = document.getElementById('step-choices');
  const proofFeedback = document.getElementById('proof-feedback');

  const proofData = {
    irrational_sqrt2: {
      title: 'Theorem 1.1: Irrationality of √2',
      statement: 'There is no rational number r ∈ Q such that r² = 2.',
      steps: [
        {
          choices: [
            { text: 'Assume for contradiction that √2 ∈ Q, so √2 = p/q in lowest terms.', correct: true, just: 'Proof by Contradiction Assumption' },
            { text: 'Assume √2 is a real number x with x > 0.', correct: false, just: 'Irrelevant' }
          ]
        },
        {
          choices: [
            { text: 'Squaring both sides gives 2 = p²/q², so p² = 2q².', correct: true, just: 'Algebraic Simplification' },
            { text: 'Taking logarithm of both sides gives log(2) = 2 log(p/q).', correct: false, just: 'Non-standard' }
          ]
        },
        {
          choices: [
            { text: 'Since p² = 2q², p² is even, which implies p is even (p = 2k).', correct: true, just: 'Number Theory Lemma' },
            { text: 'Since p² is even, q must be odd.', correct: false, just: 'Invalid Logic' }
          ]
        },
        {
          choices: [
            { text: 'Substituting p = 2k gives (2k)² = 2q² ⇒ 4k² = 2q² ⇒ q² = 2k², so q is also even.', correct: true, just: 'Algebraic Substitution' },
            { text: 'Conclude that p/q cannot be simplified.', correct: false, just: 'False' }
          ]
        },
        {
          choices: [
            { text: 'Since both p and q are even, gcd(p,q) ≥ 2, contradicting that p/q was in lowest terms.', correct: true, just: 'Contradiction Reached Q.E.D.' },
            { text: 'Hence √2 = 1.414...', correct: false, just: 'Incomplete' }
          ]
        }
      ]
    },
    monotone_convergence: {
      title: 'Theorem 2.4: Monotone Convergence Theorem',
      statement: 'If a sequence (a_n) is bounded and monotone, then it converges.',
      steps: [
        {
          choices: [
            { text: 'Assume WLOG that (a_n) is monotone increasing and bounded above by M.', correct: true, just: 'Hypothesis Setup' },
            { text: 'Assume (a_n) is strictly decreasing to 0.', correct: false, just: 'Overly restrictive' }
          ]
        },
        {
          choices: [
            { text: 'Let S = {a_n : n ∈ N}. By the Completeness Axiom, S has a supremum s = sup S ∈ R.', correct: true, just: 'Completeness Axiom of R' },
            { text: 'Let s = max S, assuming S contains its upper bound.', correct: false, just: 'May not hold for infinite sets' }
          ]
        },
        {
          choices: [
            { text: 'Fix ε > 0. Since s - ε < s, s - ε is not an upper bound, so ∃ N ∈ N with a_N > s - ε.', correct: true, just: 'Lemma on LUB Definition' },
            { text: 'For all n, a_n > s - ε.', correct: false, just: 'False for initial terms' }
          ]
        },
        {
          choices: [
            { text: 'Since (a_n) is increasing, for all n ≥ N: s - ε < a_N ≤ a_n ≤ s < s + ε.', correct: true, just: 'Monotonicity & Upper Bound' },
            { text: 'Thus a_n oscillates around s.', correct: false, just: 'Contradicts monotonicity' }
          ]
        },
        {
          choices: [
            { text: 'Hence |a_n - s| < ε for all n ≥ N, proving a_n → s = sup S. Q.E.D.', correct: true, just: 'Definition of Limit' },
            { text: 'Conclude a_n is divergent.', correct: false, just: 'Contradiction' }
          ]
        }
      ]
    },
    squeeze_theorem: {
      title: 'Theorem 2.3: Squeeze Theorem for Sequences',
      statement: 'If a_n ≤ b_n ≤ c_n for all n and a_n → L, c_n → L, then b_n → L.',
      steps: [
        {
          choices: [
            { text: 'Fix ε > 0. Choose N_1 s.t. |a_n - L| < ε for n ≥ N_1 and N_2 s.t. |c_n - L| < ε for n ≥ N_2.', correct: true, just: 'Limits Definition for a_n and c_n' },
            { text: 'Set b_n = (a_n + c_n)/2.', correct: false, just: 'Not given' }
          ]
        },
        {
          choices: [
            { text: 'Set N = max(N_1, N_2). Then for all n ≥ N, both L - ε < a_n and c_n < L + ε hold.', correct: true, just: 'Maximum Cutoff Index' },
            { text: 'Set N = N_1 + N_2.', correct: false, just: 'Unnecessary overestimate' }
          ]
        },
        {
          choices: [
            { text: 'Using a_n ≤ b_n ≤ c_n, we get L - ε < a_n ≤ b_n ≤ c_n < L + ε for all n ≥ N.', correct: true, just: 'Squeeze Inequality Bound' },
            { text: 'b_n must equal L for all n ≥ N.', correct: false, just: 'False assumption' }
          ]
        },
        {
          choices: [
            { text: 'Therefore |b_n - L| < ε for all n ≥ N, proving b_n → L. Q.E.D.', correct: true, just: 'Definition of Sequence Limit' },
            { text: 'b_n is unbounded.', correct: false, just: 'False' }
          ]
        }
      ]
    },
    extreme_value: {
      title: 'Theorem 4.4: Extreme Value Theorem',
      statement: 'If f: [a,b] → R is continuous on compact interval [a,b], then f attains its maximum and minimum.',
      steps: [
        {
          choices: [
            { text: 'Since [a,b] is compact and f is continuous, f([a,b]) is compact in R (hence closed & bounded).', correct: true, just: 'Preservation of Compactness' },
            { text: 'Assume f is differentiable on (a,b).', correct: false, just: 'Differentiability not required' }
          ]
        },
        {
          choices: [
            { text: 'Let M = sup {f(x) : x ∈ [a,b]}. Since f([a,b]) is bounded, M ∈ R exists.', correct: true, just: 'Completeness Axiom' },
            { text: 'Set M = ∞.', correct: false, just: 'Contradicts boundedness' }
          ]
        },
        {
          choices: [
            { text: 'Since f([a,b]) is closed, it contains all its limit points, so M ∈ f([a,b]).', correct: true, just: 'Closed Set Property' },
            { text: 'M cannot belong to the image of [a,b].', correct: false, just: 'False' }
          ]
        },
        {
          choices: [
            { text: 'Thus ∃ x_{max} ∈ [a,b] s.t. f(x_{max}) = M. Similarly for min. Q.E.D.', correct: true, just: 'Attainment of Maximum' },
            { text: 'No such point exists.', correct: false, just: 'Contradiction' }
          ]
        }
      ]
    }
  };

  let activeProofKey = 'irrational_sqrt2';
  let currentStepIdx = 0;

  function loadProof(key) {
    activeProofKey = key;
    currentStepIdx = 0;
    const data = proofData[key];
    if (!data) return;

    if (proofTitle) proofTitle.textContent = data.title;
    if (proofStatement) proofStatement.textContent = data.statement;
    if (proofStepList) proofStepList.innerHTML = '';
    if (proofFeedback) proofFeedback.className = 'feedback-box hidden';

    renderCurrentStepChoices();
  }

  function renderCurrentStepChoices() {
    const data = proofData[activeProofKey];
    if (!stepChoicesContainer || !data) return;

    if (currentStepIdx >= data.steps.length) {
      stepChoicesContainer.innerHTML = '<p class="text-emerald font-semibold">🎉 Proof Completed Successfully! Q.E.D.</p>';
      return;
    }

    const stepObj = data.steps[currentStepIdx];
    stepChoicesContainer.innerHTML = '';

    stepObj.choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = choice.text;
      btn.addEventListener('click', () => handleChoiceSelect(choice));
      stepChoicesContainer.appendChild(btn);
    });
  }

  function handleChoiceSelect(choice) {
    if (choice.correct) {
      const li = document.createElement('li');
      li.className = 'step-item';
      li.innerHTML = `${choice.text} <span class="step-justification">[${choice.just}]</span>`;
      if (proofStepList) proofStepList.appendChild(li);

      if (proofFeedback) {
        proofFeedback.className = 'feedback-box correct';
        proofFeedback.textContent = '✔ Correct logical step!';
      }

      currentStepIdx++;
      renderCurrentStepChoices();
    } else {
      if (proofFeedback) {
        proofFeedback.className = 'feedback-box incorrect';
        proofFeedback.textContent = '✖ Incorrect step or invalid logical deduction. Try another choice.';
      }
    }
  }

  if (proofSelect) {
    proofSelect.addEventListener('change', e => loadProof(e.target.value));
  }

  // --- 6. Pathological Functions Laboratory ---
  const pathCanvas = document.getElementById('pathological-canvas');
  let currentPath = 'dirichlet';

  document.querySelectorAll('.path-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.path-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPath = btn.getAttribute('data-path');
      drawPathologicalPlot();
    });
  });

  function drawPathologicalPlot() {
    if (!pathCanvas) return;
    const ctx = pathCanvas.getContext('2d');
    const width = pathCanvas.width;
    const height = pathCanvas.height;

    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 40); ctx.lineTo(width, height - 40);
    ctx.stroke();

    const padding = 40;
    const plotW = width - 80;
    const plotH = height - 80;

    if (currentPath === 'dirichlet') {
      // Dirichlet Function: y=1 for Q, y=0 for R\Q
      ctx.fillStyle = '#38bdf8';
      for (let i = 0; i < 400; i++) {
        const px = padding + Math.random() * plotW;
        const py = height - padding - plotH; // y = 1 line
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fb7185';
      for (let i = 0; i < 400; i++) {
        const px = padding + Math.random() * plotW;
        const py = height - padding; // y = 0 line
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f8fafc';
      ctx.font = '13px Fira Code, monospace';
      ctx.fillText("D(x) = 1 (x ∈ Q, Cyan) | D(x) = 0 (x ∉ Q, Rose)", padding, padding - 15);
    } else if (currentPath === 'thomae') {
      // Draw Thomae's Popcorn Function points p/q
      ctx.fillStyle = '#38bdf8';
      for (let q = 1; q <= 40; q++) {
        for (let p = 0; p <= q; p++) {
          if (gcd(p, q) === 1) {
            const xVal = p / q;
            const yVal = 1 / q;
            const px = xVal * plotW + padding;
            const py = height - padding - yVal * plotH;

            ctx.beginPath();
            ctx.arc(px, py, Math.max(2, 6 - q / 8), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.fillStyle = '#f8fafc';
      ctx.font = '13px Fira Code, monospace';
      ctx.fillText("Thomae's Popcorn: Continuous at Irrationals, Discontinuous at Rationals", padding, padding - 15);
    } else if (currentPath === 'weierstrass') {
      // Weierstrass Function W(x) = sum_{n=0}^15 (0.5)^n cos(13^n pi x)
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const a = 0.5;
      const b = 13;
      let first = true;

      for (let px = 0; px <= plotW; px += 1) {
        const x = (px / plotW) * 2 - 1; // x in [-1, 1]
        let y = 0;
        for (let n = 0; n < 15; n++) {
          y += Math.pow(a, n) * Math.cos(Math.pow(b, n) * Math.PI * x);
        }
        const py = height / 2 - (y / 2.5) * (plotH / 2);

        if (first) {
          ctx.moveTo(px + padding, py);
          first = false;
        } else {
          ctx.lineTo(px + padding, py);
        }
      }
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = '13px Fira Code, monospace';
      ctx.fillText("Weierstrass Function: Continuous Everywhere, Nowhere Differentiable", padding, padding - 15);
    } else if (currentPath === 'cantor') {
      // Cantor Staircase C(x) on [0, 1]
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;

      function cantorVal(x, depth = 0) {
        if (depth > 10) return x;
        if (x <= 1 / 3) return cantorVal(3 * x, depth + 1) / 2;
        if (x >= 2 / 3) return 0.5 + cantorVal(3 * (x - 2 / 3), depth + 1) / 2;
        return 0.5;
      }

      ctx.beginPath();
      let first = true;
      for (let px = 0; px <= plotW; px += 1) {
        const x = px / plotW;
        const y = cantorVal(x);
        const py = height - padding - y * plotH;

        if (first) {
          ctx.moveTo(px + padding, py);
          first = false;
        } else {
          ctx.lineTo(px + padding, py);
        }
      }
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = '13px Fira Code, monospace';
      ctx.fillText("Cantor Staircase: Continuous, Monotone, C'(x) = 0 a.e.", padding, padding - 15);
    }
  }

  function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
  }

  // --- 7. Quiz Engine ---
  const quizQuestions = [
    {
      q: 'Which statement accurately defines a compact set K ⊂ R?',
      opts: [
        'K is closed and bounded (Heine-Borel Theorem).',
        'K contains all its limit points and is infinite.',
        'K is open and connected.',
        'K is a subset of rational numbers Q.'
      ],
      ans: 0,
      exp: 'By the Heine-Borel Theorem in R, a set K ⊂ R is compact if and only if it is closed and bounded.'
    },
    {
      q: 'What is the key difference between pointwise and uniform continuity on an interval I?',
      opts: [
        'In uniform continuity, δ depends only on ε and works for all x ∈ I simultaneously.',
        'Pointwise continuity requires differentiability.',
        'Uniform continuity is only defined for closed intervals.',
        'There is no difference; they are identical.'
      ],
      ans: 0,
      exp: 'Uniform continuity requires a single δ > 0 that works for all x, y ∈ I, whereas pointwise continuity allows δ to depend on x.'
    },
    {
      q: 'What does the Bolzano-Weierstrass Theorem state?',
      opts: [
        'Every bounded sequence in R has a convergent subsequence.',
        'Every monotonic sequence is unbounded.',
        'Continuous functions are always differentiable.',
        'The sum of any infinite series converges.'
      ],
      ans: 0,
      exp: 'Bolzano-Weierstrass asserts that every sequence contained in a bounded set has at least one convergent subsequence.'
    },
    {
      q: 'According to the Mean Value Theorem, if f is continuous on [a,b] and differentiable on (a,b), then:',
      opts: [
        '∃ c ∈ (a,b) such that f\'(c) = [f(b) - f(a)] / (b - a).',
        'f\'(x) > 0 for all x ∈ [a,b].',
        'f(x) must be a linear polynomial.',
        'f attains no maximum on [a,b].'
      ],
      ans: 0,
      exp: 'The Mean Value Theorem guarantees a point c where the instantaneous rate of change equals the average rate of change.'
    },
    {
      q: 'If a sequence of continuous functions f_n converges UNIFORMLY to f on A, then f is:',
      opts: [
        'Continuous on A.',
        'Discontinuous at countable points.',
        'Unbounded on A.',
        'Strictly increasing on A.'
      ],
      ans: 0,
      exp: 'Uniform Limit Theorem: Uniform convergence preserves continuity (the limit function f of continuous f_n is continuous).'
    }
  ];

  let currentQuizIdx = 0;
  let score = 0;

  function renderQuizQuestion() {
    const q = quizQuestions[currentQuizIdx];
    if (!q) return;

    document.getElementById('quiz-question').textContent = q.q;
    const optsBox = document.getElementById('quiz-options');
    optsBox.innerHTML = '';
    document.getElementById('quiz-explanation').className = 'explanation-box hidden';

    q.opts.forEach((optText, idx) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-opt-btn';
      btn.textContent = optText;
      btn.addEventListener('click', () => checkQuizAns(idx, q.ans, q.exp));
      optsBox.appendChild(btn);
    });
  }

  function checkQuizAns(selected, correct, exp) {
    const btns = document.querySelectorAll('.quiz-opt-btn');
    btns.forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === correct) btn.classList.add('correct');
      if (idx === selected && selected !== correct) btn.classList.add('wrong');
    });

    if (selected === correct) score++;
    document.getElementById('quiz-score').textContent = `Score: ${score} / ${quizQuestions.length}`;

    const expBox = document.getElementById('quiz-explanation');
    expBox.textContent = exp;
    expBox.classList.remove('hidden');

    document.getElementById('quiz-next-btn').disabled = false;
  }

  document.getElementById('quiz-next-btn')?.addEventListener('click', () => {
    currentQuizIdx = (currentQuizIdx + 1) % quizQuestions.length;
    renderQuizQuestion();
    document.getElementById('quiz-next-btn').disabled = true;
  });

  // --- 8. Mastery Pass Subscription Enrollment Engine ---
  const masteryForm = document.getElementById('mastery-form');
  const masteryEmailInput = document.getElementById('mastery-email-input');
  const masteryCourseInput = document.getElementById('mastery-course-input');
  const masteryStatusMsg = document.getElementById('mastery-status-msg');

  if (masteryForm) {
    masteryForm.addEventListener('submit', e => {
      e.preventDefault();
      const email = masteryEmailInput ? masteryEmailInput.value.trim() : '';
      const course = masteryCourseInput ? masteryCourseInput.value.trim() : '';

      if (!email || !email.includes('@')) {
        if (masteryStatusMsg) {
          masteryStatusMsg.className = 'status-banner invalid';
          masteryStatusMsg.textContent = 'Please provide a valid student or university email address.';
          masteryStatusMsg.classList.remove('hidden');
        }
        return;
      }

      // Save subscriber lead to localStorage
      try {
        const existingLeads = JSON.parse(localStorage.getItem('mat470_mastery_leads') || '[]');
        existingLeads.push({
          email,
          course: course || 'MAT 470 Real Analysis',
          registeredAt: new Date().toISOString(),
          discountClaimed: true
        });
        localStorage.setItem('mat470_mastery_leads', JSON.stringify(existingLeads));
      } catch (err) {}

      if (masteryStatusMsg) {
        masteryStatusMsg.className = 'status-banner valid';
        masteryStatusMsg.innerHTML = `🎉 Success! Student pass discount locked for <strong>${email}</strong> ($9.99/mo). Check your inbox for your access key!`;
        masteryStatusMsg.classList.remove('hidden');
      }

      if (masteryEmailInput) masteryEmailInput.value = '';
    });
  }

  // Initializations
  renderMath();
  drawEpsilonGraph();
  loadProof('irrational_sqrt2');
  renderQuizQuestion();
});

