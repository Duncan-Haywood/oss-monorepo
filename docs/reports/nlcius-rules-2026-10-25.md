# NLCIUS rules (2026-10-25)

For the next run on `ventures/einvoice-preflight`. `plain/nlcius-ubl.json` is built by
`build-nl-rules.mjs` from `phive-rules-simplerinvoicing` 4.6.3 (Maven Central, reachable from
cloud sessions; GitHub NPA repo is not looked up). Same jar holds `nlcius-cii-1.0.3.13.xslt`:
the CII form is the obvious next slice (add `cii` to the `nlcius` entries in
`schematron-core.mjs` and `plain-schematron.mjs`, and extend the builder). The compiled XSLT
bundles the EN 16931 base; the builder keeps pattern M14 only. Other national sets in the
same Maven group are unread: `phive-rules-cius-dk`, `-cius-pt`, `-ehf`, `-finvoice`, `-isdoc`,
`-eracun`, `-ublbe`, `-ebinterface`, `-facturae`, `-svefaktura`.
