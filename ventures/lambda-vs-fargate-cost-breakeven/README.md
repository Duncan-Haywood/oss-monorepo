# Lambda vs Fargate Cost Break-Even

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/lambda-vs-fargate-cost-breakeven/>

Compare the monthly cost of **AWS Lambda, Google Cloud Run, AWS Fargate and EC2** for one workload
and find the request volume where always-on containers beat pay-per-request. Browser page or
zero-dependency CLI; nothing is uploaded and no cloud account is contacted.

```
node cli.mjs compare --requests 20M --duration-ms 120 --memory 0.5 --vcpu 0.25 --concurrency 10
node cli.mjs compare workload.txt --json
node cli.mjs breakeven --duration-ms 300 --memory 1 --concurrency 1
node cli.mjs compare workload.txt --expect fargate    # CI: exit 1 when another platform is cheapest
```

Inputs: requests/month (suffixes k, M, B), average duration (ms), memory (GiB), vCPU, concurrency per
container, peak/average ratio and the always-on floor. Prices are editable list prices (`--lambda-per-m-req`,
`--fargate-per-vcpu-hour`, ...).

Model: Lambda = requests fee + requests x seconds x GiB x price. Cloud Run (request-billed) shares instance
seconds across `concurrency`. Fargate/EC2 = tasks sized for peak concurrency (at least the floor) x 730 h.
Free tiers, discounts, data transfer, load balancers, cold starts and ops time are not modelled.
An estimate, not a bill. MIT licence.
