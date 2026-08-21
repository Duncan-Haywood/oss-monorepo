// vitest alias target for the "server-only" package (see vitest.config.ts).
// Vite/vitest module resolution doesn't apply Next's "react-server" export
// condition, so importing "server-only" directly in tests throws
// unconditionally (see node_modules/server-only/index.js). This stub mirrors
// the package's own "react-server" conditional export (empty.js) so modules
// gated with `import "server-only"` can be imported from test files that
// need to exercise their real logic instead of mocking the whole module.
export {};
