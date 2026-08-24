# DNS configuration evidence probe

This local probe compares two fixture observations for a customer-authorized
domain and emits portable JSON evidence. It preserves query type, answers,
resolver, and timestamps. Timeout, disagreement, refusal, DNSSEC failure, and
context changes are `inconclusive`, never silently treated as unchanged.

Run `python3 -m unittest discover -s portfolio/pipeline/probes/dns-configuration-evidence -p 'test_*.py'`.

The output is not a security, uptime, email-delivery, or compliance result. The
customer decides whether an observed change needs investigation. Real resolver
scheduling, demand, and distribution remain unmeasured. No account, API key,
payment, or public listing is required.
