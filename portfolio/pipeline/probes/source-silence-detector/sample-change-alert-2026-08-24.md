# Register change — subscriber alert

This is a change the register published. It is not a finding about you.

**Tool:** `source-silence-detector` v0.1.0  
**Generated:** 2026-08-24T00:00:00Z  
**Register:** CISA Known Exploited Vulnerabilities catalog (`cisagov/kev-data`)  
**Vertical:** software-security  
**Change:** entry_added `CVE-2021-44228`  
**When the register published it:** 2021-12-10  
**Source document:** https://www.cisa.gov/known-exploited-vulnerabilities-catalog
**Register-published entry link:** https://nvd.nist.gov/vuln/detail/CVE-2021-44228
**Catalog slice:** version 2026.08.21, released 2026-08-21T17:46:43.6019Z (this file carries 1 entry)

## What this alert covers

This alert reports that a public register published a change, and quotes the fields that register published. It does not read any other register, does not know whether the change matters to you, and does not know whether your products, customers, or staff are named in it. The source document is linked so you can read the register yourself.

> **This sample is a software-security catalog addition. The first experiment named professional licensing and disciplinary actions as the vertical; those boards have no usable git mirror from this environment and their portals are egress-denied. Buyers of this particular feed already receive it free from npm audit, Dependabot, and the catalog's own mailing list. The format is what step 2 asked for. The vertical is the one step 1 could actually reach.**

## Quoted from the register

Every row is a field the catalog published, or an explicit unknown. Nothing in this table is inferred.

| Field | State | Value |
|---|---|---|
| `cveID` | from register | CVE-2021-44228 |
| `vendorProject` | from register | Apache |
| `product` | from register | Log4j2 |
| `vulnerabilityName` | from register | Apache Log4j2 Remote Code Execution Vulnerability |
| `dateAdded` | from register | 2021-12-10 |
| `shortDescription` | from register | Apache Log4j2 contains a vulnerability where JNDI features do not protect against attacker-controlled JNDI-related endpoints, allowing for remote code execution. |
| `requiredAction` | from register | For all affected software assets for which updates exist, the only acceptable remediation actions are: 1) Apply updates; OR 2) remove affected assets from agency networks. Temporary mitigations using one of the measures provided at https://www.cisa.gov/uscert/ed-22-02-apache-log4j-recommended-mitigation-measures are only acceptable until updates are available. |
| `dueDate` | from register | 2021-12-24 |
| `knownRansomwareCampaignUse` | from register | Known |
| `notes` | from register | https://nvd.nist.gov/vuln/detail/CVE-2021-44228 |
| `cwes` | from register | CWE-20, CWE-400, CWE-502 |

CISA `requiredAction` and `dueDate` are US-federal catalog text aimed at federal civilian executive branch agencies. They are quoted because the register published them. They are not instructions to the subscriber.

## What this alert is not

- A determination that your product, network, or customers are affected.
- Advice about what you should do. requiredAction and dueDate are what CISA published for US federal agencies, quoted as catalog text, not instructions to you.
- A score or ranking of any person, vendor, or product.
- A filing, notification, or transmission on your behalf. You read the register; we do not submit anything.
- Evidence that this is the only change, or that the register is complete. We quote one addition we were handed.

## Fields this page will not invent

- whether your inventory contains the named product
- what you should do about the change
- a score or ranking of anyone the record names
- a licensing-board action — this sample is not from that vertical
- a filing or notification sent on your behalf

## How this can be wrong

Change-detection accuracy is not measured. The 6-of-17 (0.35) held-out figure printed on the subscriber record is for the silence detector — a different surface, answering whether a mirror went quiet, not whether a catalog added an entry. This alert quotes one historical addition that was already in the catalog. It does not claim it would have caught that addition on the day it landed, or that it would catch the next one.

A change alert is the thing we sell, so more alerts look like more product. Over-notifying — sending you a change that was not a real addition, or dressing catalog text up as a finding about you — is the error that would pay us. That is why every quoted field is labelled as a register quote or as unknown, and why this page will not say the change affects you.
