# NAT Gateway Cost Advisor

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/nat-gateway-cost-advisor/>

Is your NAT gateway bill avoidable? Paste one row per NAT gateway and destination (GB per month) and see
what the gateway costs, which destinations should bypass it through a **free S3/DynamoDB gateway
endpoint** or a **paid interface endpoint that still beats $0.045/GB**, the net saving after endpoint fees,
and the `aws ec2 create-vpc-endpoint` commands. Browser page or zero-dependency CLI.

After using this, you can name the S3 and DynamoDB traffic you are paying $0.045/GB to push through a NAT
gateway for nothing, and the exact endpoints to create, which used to take a Flow Logs spreadsheet and a
pricing-page calculation per service.

```
node cli.mjs analyze nat.csv
cat nat.csv | node cli.mjs analyze -
node cli.mjs analyze nat.csv --azs 3 --region eu-west-1
node cli.mjs analyze nat.csv --fail-on warn          # CI: exit 1 on any avoidable NAT spend
node cli.mjs analyze nat.csv --json --prices prices.json
```

Input: rows of `gateway,destination,gb_per_month[,vpc]`. Destination is `s3`, `dynamodb`, `ecr`, `logs`,
`monitoring`, `sts`, `secretsmanager`, `ssm`, `kms`, `sqs`, `sns`, `kinesis`, `lambda`, `ecs`, or anything else
(counted as internet). GB per month comes from VPC Flow Logs or Cost Explorer's `NatGateway-Bytes`. The
optional `vpc` column keeps endpoints per VPC; header names remap columns.

| rule | level | meaning |
| --- | --- | --- |
| `gateway-endpoint-free` | error / warn | S3 or DynamoDB traffic on the NAT gateway; a free gateway endpoint removes the charge (error at >= $50/month) |
| `interface-endpoint-saves` | error / warn | an interface endpoint set (hourly fee per AZ + $0.01/GB) beats the NAT's $0.045/GB |
| `nat-gateway-idle` | warn | a gateway under 10 GB/month still bills about $36.50 |
| `interface-endpoint-not-worth`, `internet-dominant`, `nat-fine` | info | break-even not reached; endpoints cannot help internet traffic; nothing to do |

Exit 1 on an error (or any warning with `--fail-on warn`); 2 on bad input or no rows.

## What it is not

The GB per destination is a number you supply; unlabelled traffic is counted as internet and never
recommended for an endpoint. List prices are illustrative and dated (us-east-1) and ignore other regions,
cross-AZ transfer, data transfer out, endpoint policies and non-AWS PrivateLink services (editable with
`--prices`). Not a bill, not advice, no warranty. Create an endpoint in one VPC first.

## Privacy

No network call, no AWS access, no account, no analytics vendor. The browser page analyses pasted text
locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
