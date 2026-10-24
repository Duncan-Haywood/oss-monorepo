# Exemption Certificate Audit Check

Free, private browser tool for wholesalers, distributors and contractors: paste your tax-exempt sales and the exemption certificates you have on file. It finds the sales with no usable certificate (none, for another state, expired, signed after the sale, or for a different reason), totals the tax at stake at your rates, ranks the customers to chase, and writes a request letter for each. Downloads a chase list, letters, a per-sale result file and a renewals list.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/exemption-certificate-audit-check/

Open `index.html`. Tests: `node --test 'ventures/exemption-certificate-audit-check/**/*.test.mjs'`.

Not tax advice. Whether a state accepts a late certificate and how long one stays valid are the state's rules and are entered by the user, not assumed. See `VENTURE.yaml`.
