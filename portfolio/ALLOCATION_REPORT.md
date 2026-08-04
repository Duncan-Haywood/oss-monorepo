# Portfolio Effort & Resource Allocation Report

**Total Portfolio Budget Cap:** `$300.00 USD`
**Total Ventures Monitored:** 11

## Venture Effort Work Queue

| Rank | Venture | Stage | Stopping Rule | Protected | MRR | Monthly Cap | Allocated Budget | Primary Focus |
|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| 1 | **[ai-engineering-academy](../ventures/ai-engineering-academy)** | `prototype` | `none` | YES | Unmeasured | $40.00 | **$40.00** | Core feature completion and concierge MVP testing |
| 2 | **[ai-first-markets](../ventures/ai-first-markets)** | `prototype` | `none` | YES | Unmeasured | $30.00 | **$30.00** | Core feature completion and concierge MVP testing |
| 3 | **[mat-470-real-analysis](../ventures/mat-470-real-analysis)** | `prototype` | `none` | YES | Unmeasured | $20.00 | **$20.00** | Core feature completion and concierge MVP testing |
| 4 | **[photos-import-tools](../ventures/photos-import-tools)** | `prototype` | `none` | YES | Unmeasured | $20.00 | **$20.00** | Core feature completion and concierge MVP testing |
| 5 | **[local-site-studio](../ventures/local-site-studio)** | `prototype` | `none` | YES | $0.00 | $50.00 | **$28.50** | Core feature completion and concierge MVP testing |
| 6 | **[photo-editing](../ventures/photo-editing)** | `prototype` | `none` | YES | $0.00 | $35.00 | **$24.22** | Core feature completion and concierge MVP testing |
| 7 | **[print-atelier](../ventures/print-atelier)** | `prototype` | holding | YES | $0.00 | $60.00 | **$20.59** | Core feature completion and concierge MVP testing |
| 8 | **[real-estate-agent-photo-app](../ventures/real-estate-agent-photo-app)** | `prototype` | `none` | YES | $0.00 | $30.00 | **$20.00** | Core feature completion and concierge MVP testing |
| 9 | **[retail-pilot-intel](../ventures/retail-pilot-intel)** | `prototype` | `none` | YES | $0.00 | $50.00 | **$20.00** | Core feature completion and concierge MVP testing |
| 10 | **[ubuntu-agent-server](../ventures/ubuntu-agent-server)** | `prototype` | `none` | YES | $0.00 | $40.00 | **$20.00** | Core feature completion and concierge MVP testing |
| 11 | **[quick-pick-survey](../ventures/quick-pick-survey)** | `prototype` | `none` | No | $0.00 | $30.00 | **$6.80** | Core feature completion and concierge MVP testing |

**Total Allocated Agent Spend:** `$250.11 USD` of `$300.00 USD` cap (`$49.89 USD` unallocated)

## Stopping Rules

No venture has tripped a declared stopping rule against recorded ledger history. That is a measurement, not a guarantee: see the count below.

10 of 11 venture(s) draw `$229.52` with no criterion this engine can measure, so no rule in the system can ever stop their funding: `ai-engineering-academy`, `ai-first-markets`, `mat-470-real-analysis`, `photos-import-tools`, `local-site-studio`, `photo-editing`, `real-estate-agent-photo-app`, `retail-pilot-intel`, `ubuntu-agent-server`, `quick-pick-survey`. `scripts/ci/kill_criteria_ratchet.py` holds that count and reports why each one is unevaluable.

## Allocation Principles Applied

1. **Protected Explore Budget**: Ventures with `budget.protected: true` are guaranteed baseline funding regardless of short-term measured MRR.
2. **Unmeasured Distinction**: Unmeasured ventures (`economics.mrr: null`) receive neutral explore credit rather than being penalized as zero-revenue.
3. **Stage-Gated Escalation**: Higher stage ventures (`launched`/`revenue`) receive priority allocations for customer acquisition and monetization scaling.
4. **The Cap Is A Ceiling**: Total allocated spend never exceeds the portfolio budget cap. The protected floor in principle 1 is a floor within the cap, not a claim against it; when the budget cannot fund every floor, the shortfall falls on the lowest-scoring ventures and is reported above.
5. **Declared Stopping Rules**: A venture whose `kill_criteria` fire against recorded ledger history is ranked last, allocated `$0.00`, and escalated below. Whether to wind it down is the portfolio owner's decision; withholding the next month's budget until that decision exists is this engine's.
