// Only the happy-dom files (React components) need jest-dom's matchers and
// Testing Library's cleanup. The pure-logic files (36 of 56) run in Node and
// skip both: importing @testing-library/react loads react-dom into each of
// them, which was about a fifth of the suite's wall time.
import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup, configure } = await import("@testing-library/react");
  // findBy*/waitFor default to 1 s. On a cold first run with four workers a
  // mocked fetch plus a React re-render overran that once (sov-import,
  // 2026-11-25); the assertions are unchanged, they may just wait longer.
  configure({ asyncUtilTimeout: 3000 });
  afterEach(() => {
    cleanup();
  });
}
