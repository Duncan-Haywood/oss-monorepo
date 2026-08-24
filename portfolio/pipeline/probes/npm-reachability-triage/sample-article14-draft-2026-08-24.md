# Article 14 notification draft — CVE-2021-44228

> This is a DRAFT for the manufacturer to review and, if they choose, to submit. It is not a filing, not a transmission, not an attestation, and not a conformity assessment. We do not hold the reporting-portal credentials and we do not send this anywhere.

> The field list below is a secondary reconstruction of contents commonly cited for a CRA Article 14 notification. It has not been checked against the regulation on EUR-Lex from this environment. Treat every row as a checklist item the manufacturer completes, not as an official form id.

> The exploitation signal is CISA's Known Exploited Vulnerabilities catalog, reached via its git mirror. That is a US federal catalog. It is not the EU Vulnerability Database, and a KEV listing is not by itself a CRA determination that a vulnerability is 'actively exploited' in the manufacturer's product. The manufacturer decides whether this case is theirs to report.

## Catalog case

- CVE: `CVE-2021-44228`
- Catalog product: Apache / Log4j2
- Catalog name: Apache Log4j2 Remote Code Execution Vulnerability
- Date added: 2021-12-10
- Catalog version: 2026.08.21 (released 2026-08-21T17:46:43.6019Z)
- Catalog source: https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json
- Draft generated: 2026-08-24T11:49:00Z

## Clocks (secondary; unverified against EUR-Lex)

- Early warning — commonly cited as within 24 hours of awareness
- Update — commonly cited as within 72 hours of awareness
- Final report — commonly cited as within 14 days of a corrective or mitigating measure

## Fields

| Clock | Field | Value | Source | Status |
|---|---|---|---|---|
| early_warning_24h | Notification kind | actively exploited vulnerability (catalog listing; manufacturer confirms) | derived:kev-listing | populated |
| early_warning_24h | Manufacturer name | unknown — manufacturer completes | customer | unknown |
| early_warning_24h | Manufacturer contact | unknown — manufacturer completes | customer | unknown |
| early_warning_24h | Product name | Log4j2 | kev:product | populated |
| early_warning_24h | Vendor / project named by the catalog | Apache | kev:vendorProject | populated |
| early_warning_24h | Product version(s) the manufacturer shipped | unknown — manufacturer completes | customer | unknown |
| early_warning_24h | Unique product identifiers | unknown — manufacturer completes | customer | unknown |
| early_warning_24h | Vulnerability identifier | CVE-2021-44228 | kev:cveID | populated |
| early_warning_24h | Vulnerability name | Apache Log4j2 Remote Code Execution Vulnerability | kev:vulnerabilityName | populated |
| early_warning_24h | Short description from the catalog | Apache Log4j2 contains a vulnerability where JNDI features do not protect against attacker-controlled JNDI-related endpoints, allowing for remote code execution. | kev:shortDescription | populated |
| early_warning_24h | Date the catalog listed this entry | 2021-12-10 | kev:dateAdded | populated |
| early_warning_24h | Date the manufacturer became aware | unknown — manufacturer completes | customer | unknown |
| early_warning_24h | Corrective or mitigating text in the catalog | For all affected software assets for which updates exist, the only acceptable remediation actions are: 1) Apply updates; OR 2) remove affected assets from agency networks. Temporary mitigations using one of the measures provided at https://www.cisa.gov/uscert/ed-22-02-apache-log4j-recommended-mitigation-measures are only acceptable until updates are available. | kev:requiredAction | populated |
| early_warning_24h | Catalog ransomware-campaign flag | Known | kev:knownRansomwareCampaignUse | populated |
| early_warning_24h | Catalog notes / source link | https://nvd.nist.gov/vuln/detail/CVE-2021-44228 | kev:notes | populated |
| early_warning_24h | CWE identifiers in the catalog | CWE-20, CWE-400, CWE-502 | kev:cwes | populated |
| update_72h | Severity as the manufacturer assesses it | unknown — manufacturer completes | customer | unknown |
| update_72h | Potential impact on the shipped product | unknown — manufacturer completes | customer | unknown |
| update_72h | Known exploitative circumstances | unknown — manufacturer completes | customer | unknown |
| update_72h | How the manufacturer became aware | unknown — manufacturer completes | customer | unknown |
| final_14d | Corrective or mitigating measures taken | unknown — manufacturer completes | customer | unknown |
| final_14d | Residual risk the manufacturer accepts | unknown — manufacturer completes | customer | unknown |

11 of 22 fields populated from the catalog or the manufacturer; 11 remain for the manufacturer.

## Catalog required-action text (quoted, not advice)

The next paragraph is CISA catalog text written for US federal agencies. It is not CRA advice and it is not an instruction from this tool.

> For all affected software assets for which updates exist, the only acceptable remediation actions are: 1) Apply updates; OR 2) remove affected assets from agency networks. Temporary mitigations using one of the measures provided at https://www.cisa.gov/uscert/ed-22-02-apache-log4j-recommended-mitigation-measures are only acceptable until updates are available.

## What this draft does not do

- It does not file, transmit, or notify ENISA or any CSIRT.
- It does not assert that the manufacturer's product is in scope.
- It does not match this CVE against a customer SBOM; that is a separate step the manufacturer performs.
- It does not replace the EU Vulnerability Database. That feed is egress-denied from the environment that built this tool.
