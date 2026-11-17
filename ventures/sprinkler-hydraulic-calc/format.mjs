// A plain-text network format, one item per line, so a system can be typed,
// pasted from a spreadsheet or kept in a file beside the drawings.
//
//   source BOR
//   supply static=65 residual=45 at=800
//   design density=0.15 area=130 min=7 hose=250 margin=5
//   node BOR elev=0
//   node H11 elev=12 k=5.6 x=2 y=0          (a sprinkler: give k)
//   node HV elev=10 gpm=50                   (a fixed outflow, e.g. inside hose)
//   pipe feed BOR RISER len=40 fit=30 size=4 sch=sch40 c=120
//   pipe tie A B len=12 id=2.2 c=150         (id= gives an inside diameter)
//
// Anything after # is a comment.

const NODE_KEYS = { elev: 'elevationFt', k: 'k', area: 'areaFt2', x: 'x', y: 'y', gpm: 'demandGpm', min: 'minGpm' };
const PIPE_KEYS = { len: 'lengthFt', fit: 'fittingsFt', size: 'size', sch: 'schedule', c: 'c', id: 'idIn' };
const DESIGN_KEYS = { density: 'densityGpmFt2', area: 'areaPerHeadFt2', min: 'minPsi', hose: 'hoseGpm', margin: 'safetyMarginPsi' };
const SUPPLY_KEYS = { static: 'staticPsi', residual: 'residualPsi', at: 'residualGpm' };

function pairs(words, keys, line, errors, into) {
  for (const w of words) {
    const m = /^([a-z]+)=(.+)$/.exec(w);
    if (!m || !(m[1] in keys)) { errors.push(`Line ${line}: did not understand "${w}".`); continue; }
    const field = keys[m[1]];
    if (field === 'size' || field === 'schedule') into[field] = m[2];
    else {
      const v = Number(m[2]);
      if (!Number.isFinite(v)) errors.push(`Line ${line}: "${m[1]}" must be a number, not "${m[2]}".`);
      else into[field] = v;
    }
  }
  return into;
}

export function parse(text) {
  const model = { source: null, nodes: [], pipes: [], design: {} };
  const errors = [];
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const words = raw.replace(/#.*/, '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const [kind, ...rest] = words;
    if (kind === 'source') model.source = rest[0] || null;
    else if (kind === 'supply') model.supply = pairs(rest, SUPPLY_KEYS, line, errors, {});
    else if (kind === 'design') pairs(rest, DESIGN_KEYS, line, errors, model.design);
    else if (kind === 'node') {
      if (!rest.length) { errors.push(`Line ${line}: a node needs a name.`); return; }
      const n = pairs(rest.slice(1), NODE_KEYS, line, errors, { id: rest[0] });
      if (n.elevationFt === undefined) n.elevationFt = 0;
      model.nodes.push(n);
    } else if (kind === 'pipe') {
      if (rest.length < 3) { errors.push(`Line ${line}: a pipe needs a name, a from node and a to node.`); return; }
      const p = pairs(rest.slice(3), PIPE_KEYS, line, errors, { id: rest[0], from: rest[1], to: rest[2], fittingsFt: 0, schedule: 'sch40' });
      model.pipes.push(p);
    } else errors.push(`Line ${line}: lines start with source, supply, design, node or pipe, not "${kind}".`);
  });
  if (model.supply) {
    const s = model.supply;
    if (!(s.staticPsi > 0 && s.residualPsi >= 0 && s.residualPsi < s.staticPsi && s.residualGpm > 0)) errors.push('Supply: give static > residual >= 0 psi and the flow in gpm at the residual (static=.. residual=.. at=..).');
  }
  return { model, errors };
}

const num = v => String(Math.round(v * 1e6) / 1e6);

export function serialize(model) {
  const out = [];
  out.push(`source ${model.source}`);
  if (model.supply) out.push(`supply static=${num(model.supply.staticPsi)} residual=${num(model.supply.residualPsi)} at=${num(model.supply.residualGpm)}`);
  const d = model.design || {};
  const dw = Object.entries(DESIGN_KEYS).filter(([, f]) => d[f] !== undefined).map(([k, f]) => `${k}=${num(d[f])}`);
  if (dw.length) out.push(`design ${dw.join(' ')}`);
  for (const n of model.nodes) out.push(['node', n.id, ...Object.entries(NODE_KEYS).filter(([, f]) => n[f] !== undefined).map(([k, f]) => `${k}=${num(n[f])}`)].join(' '));
  for (const p of model.pipes) {
    const w = ['pipe', p.id, p.from, p.to, `len=${num(p.lengthFt)}`];
    if (p.fittingsFt) w.push(`fit=${num(p.fittingsFt)}`);
    if (p.idIn) w.push(`id=${num(p.idIn)}`);
    else w.push(`size=${p.size}`, `sch=${p.schedule || 'sch40'}`);
    w.push(`c=${num(p.c)}`);
    out.push(w.join(' '));
  }
  return out.join('\n') + '\n';
}
