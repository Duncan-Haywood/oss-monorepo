# HTTP fixtures

Hand-written for these tests: **not** captured from a real QuickBooks company, and they contain no
real credentials or customer data. They are shaped after the field names in Intuit's published
schema (QuickBooks-V3-PHP-SDK `src/XSD/Finance.xsd`, `src/Data/IPP*.php`) and the token response
shown in intuit/oauth-jsclient's README. Ids, timestamps, names and messages are made up.

When the integration is first run against an Intuit sandbox company, replace or extend these with
recorded responses (scrub tokens, realm ids and personal data first).
