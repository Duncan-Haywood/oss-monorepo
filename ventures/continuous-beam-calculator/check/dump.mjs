// Reads [{model, xs}] as JSON on stdin; prints reactions and M, deflection at each x (all loads solved together).
import { createSolver, at } from '../beam.mjs';
let raw = ''; process.stdin.on('data', d => { raw += d; }).on('end', () => {
  const out = JSON.parse(raw).map(({ model, xs }) => {
    const { m, mesh, solve } = createSolver(model);
    const sol = solve(m.loads);
    const pts = xs.map(X => {
      // left-hand limit at a node (the element ending there), right-hand only at x = 0
      let e = X <= 0 ? 0 : mesh.elems.findIndex(el => X > el.a && X <= el.b); if (e < 0) e = mesh.elems.length - 1;
      const s = at(mesh, sol, e, X - mesh.elems[e].a); return { M: s.M, defl: s.defl };
    });
    return { R: sol.R, pts };
  });
  process.stdout.write(JSON.stringify(out));
});
