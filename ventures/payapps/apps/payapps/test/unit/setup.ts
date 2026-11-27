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
  // 2026-11-25), and 3 s once more on a GitHub runner (sov-import, deploy run
  // 45950799211, 2026-11-27, which blocked a production deploy of unchanged
  // code). The assertions are unchanged; a passing wait still returns as soon
  // as it passes, so only a real failure takes the full 10 s.
  configure({ asyncUtilTimeout: 10_000 });
  afterEach(() => {
    cleanup();
  });
}
