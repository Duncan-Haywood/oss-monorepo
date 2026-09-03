# Pool route pricing calculator

Scored 2026-08-24. Composite 7.0 · floor 1 (ai_leverage). The floor is the
point: the arithmetic is deterministic and there is no model in the loop, which
is what keeps the per-user cost at zero and the output auditable by the operator
who typed the inputs.

Independent pool-service operators need a monthly account price that covers
pool time, windshield time, chemicals, and recurring overhead. Generic hourly
calculators and one-off trade bid tools do not model recurring route accounts.

The browser-local tool turns the operator's own averages into minimum monthly
revenue and per-account pricing at a target margin. It is free, private, and
usable without an account or API key. Search phrases include “pool service
pricing calculator,” “weekly pool service pricing,” and “pool route
profitability.”

Existing alternatives are spreadsheets, accounting tools, and paid industry
suites. The wedge is a narrow, transparent calculator that makes drive time and
chemical allowance explicit. A future hosted tier could add saved route
history, exports, or team presets; launch has zero per-user hosting or
inference cost.

Outputs are arithmetic observations, not financial, tax, wage, or business
advice. No customer data leaves the browser. This is distinct from existing
one-off trade bid calculators because the unit is a recurring monthly account
and the output is a route-level threshold.
