# NAV Online Számla sample files

Copied from NAV's public repository
[nav-gov-hu/Online-Invoice](https://github.com/nav-gov-hu/Online-Invoice) (`sample/Data sample`
and `sample/API sample`), MIT licence, copyright (c) 2019 Nemzeti Adó- és Vámhivatal
(`LICENCE-NAV.md`). The one edit: in `manageInvoice.xml` the sample's technical-user login,
password hash, request signature and exchange token were replaced, since the checker never reads them.

| file here | NAV's name |
|---|---|
| `foreign-currency.xml` | `Belfoldi devizas szamla.xml` (EUR invoice, three VAT rates) |
| `simplified.xml` | `Belfoldi egyszerusitett szamla.xml` (simplified invoice, VAT content) |
| `modification.xml` | `Teves termek helyesbitese.xml` (a modifying document) |
| `several-vat-types.xml` | `Belfoldi ertekesites tobb AFA tipus.xml` (exempt, reverse charge, margin scheme; it carries two summary typos the checker reports) |
| `manageInvoice.xml` | `API sample/manageInvoice.xml` (three Base64 invoiceData operations with electronicInvoiceHash; the embedded invoices carry the 2.0 `privatePersonIndicator`, which the 3.0 XSD refuses) |
| `product-fee.xml` | `Termekdijas szamla.xml` (two lines with KT product fee content, a DEPOSIT productFeeSummary of three codes) |
| `aggregate.xml` | `Gyujtoszamla 2.xml` (an AGGREGATE invoice; its four lineDeliveryDate values are in 2019 while the header delivery date is 2021-05-13, which Annex I warning 321 reports; `Gyujtoszamla 1.xml`, the same invoice, has 2021 line dates) |
| `chain-base.xml` | `Eredeti szamla modositasokhoz.xml` (ZZZ000001, the base invoice NAV's modification samples refer to: five lines, net 5,500,000 HUF) |
| `chain-modify-1.xml` | `Modositas es ervenytelenites 1.xml` (ZZZ000009, modification 1 of ZZZ000001: one new line, net -2,200,000) |
| `chain-cancel-2.xml` | `Modositas es ervenytelenites 2.xml` (ZZZ000047, modification 2 of ZZZ000001: six new lines, net -3,300,000, which brings the chain to zero: the cancellation of the sample's title) |
| `chain-line-modify.xml` | `Teteladatok modositasa.xml` (ZZZ000005, modification 1 of ZZZ000001: lineOperation MODIFY on line 1) |
