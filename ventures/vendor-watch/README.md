# Vendor Watch

A free, no-account tool for security, procurement, and privacy practitioners: paste the public URL of a vendor's terms of service, privacy policy, or subprocessor list, click "Check for changes," and get a timestamped, source-linked, word-level diff against the last time someone checked that page — or an explicit "first snapshot captured" / "no change" / "inconclusive" result, since fetch failures are never silently reported as "no change." It is an evidence feed, not legal, compliance, or contract-review advice; disclaimers are shown on the page and in the footer. The store is a small, shared, capped, in-memory prototype (not a database and not a per-customer archive), and there is no scheduled/background monitoring in this version — every check is triggered manually by a visitor; scheduled re-checks are a natural next step once hosting is decided.

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).
