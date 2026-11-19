# Survey of this repository's own CSP headers, 2026-11-18

Command: `node ventures/csp-policy-check/eval/survey-repo-csps.mjs` (from the repository root). Template holes `${...}` read as `'none'`.

23 policies; 7 with a high finding; 15 with no high or medium finding

| Where | Policy | High / medium findings |
|---|---|---|
| `ventures/status-keeper/server.mjs:77` | `default-src 'none'; style-src 'unsafe-inline'` | none |
| `ventures/status-keeper/server.mjs:82` | `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'` | none |
| `ventures/open-tennis-robots/src/tennisbots/remote.py:215` | `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'` | high unsafe-inline |
| `ventures/help-keeper/server.mjs:51` | `default-src 'none'; style-src 'unsafe-inline'; img-src https:; frame-ancestors 'none'; form-action 'self'` | none |
| `ventures/trade-bid-studio/server.mjs:71` | `default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'` | high unsafe-inline, medium no-base-uri |
| `ventures/support-agent/server.mjs:74` | `default-src 'self'; style-src 'unsafe-inline' 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:` | medium no-base-uri |
| `ventures/cancel-flow/server.mjs:64` | `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; frame-ancestors 'none'` | high unsafe-inline, medium no-base-uri |
| `ventures/cancel-flow/server.mjs:109` | `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` | high unsafe-inline, medium no-base-uri |
| `ventures/mrr-pulse/server.mjs:74` | `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'` | none |
| `ventures/proposal-maker/server.mjs:122` | `sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:` | none |
| `ventures/referral-keeper/server.mjs:66` | `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'` | none |
| `ventures/error-keeper/server.mjs:51` | `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'` | high unsafe-inline |
| `ventures/form-inbox/server.mjs:52` | `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'` | none |
| `ventures/rev-rec/server.mjs:64` | `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'` | none |
| `ventures/visit-keeper/server.mjs:54` | `default-src 'none'; style-src 'unsafe-inline'; img-src data:` | none |
| `ventures/slot-keeper/server.mjs:74` | `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'` | none |
| `ventures/link-keeper/server.mjs:31` | `default-src 'none'; style-src 'unsafe-inline'` | none |
| `ventures/babysitting-business-kit/references.mjs:294` | `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'` | none |
| `ventures/babysitting-business-kit/agreements.mjs:346` | `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'` | none |
| `ventures/support-desk/server.mjs:113` | `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'` | none |
| `ventures/survey-keeper/server.mjs:55` | `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'` | none |
| `ventures/feedback-board/server.mjs:60` | `default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'` | high unsafe-inline, medium no-base-uri |
| `ventures/webhook-relay/server.mjs:101` | `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'` | high unsafe-inline, medium no-base-uri |

| Finding | Policies |
|---|---|
| high unsafe-inline | 7 |
| info no-form-action | 10 |
| info no-frame-ancestors | 9 |
| info style-unsafe-inline | 23 |
| low no-base-uri | 14 |
| low object-src-open | 3 |
| medium no-base-uri | 6 |
