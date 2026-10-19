# Build and sell Open Tennis Robots

**Yes, you may sell these.** Everything in this project (hardware designs,
firmware, software, docs) is under the MIT licence. You can build the
feeder or the collector, put your own brand on it, and sell it as a kit or
assembled, with no royalty and no permission needed. The licence asks only
that you keep the copyright and licence notice with the software and
designs (a page in the manual is fine). It comes with no warranty, and you
are the manufacturer of whatever you ship.

If you build and sell one, open an issue: we will link sellers from the
project page so players can buy one instead of building it.

## What you are taking on as a seller

This is a machine that throws balls at up to 100+ km/h and a robot that
drives near people, with a large lithium battery and a radio. Plan for:

| Item | Why | Typical route |
| --- | --- | --- |
| Product safety evaluation | Moving parts, stored energy, projectile. Retailers and insurers ask for it | A test lab's report against the applicable standard for your market |
| Radio compliance | ESP32 and Raspberry Pi radios. A pre-certified *module* does not certify the finished product | US: FCC Part 15 (SDoC or certification). EU: RED/CE. UK: UKCA |
| Battery transport (UN 38.3) | Lithium packs cannot ship without a UN 38.3 test summary | Buy packs whose maker supplies one, and keep it on file |
| Battery safety data sheet | Carriers and Amazon dangerous-goods review ask for it | From the pack maker |
| Warnings and manual | Required in most markets, in the buyer's language | Start from [`../hardware/safety.md`](../hardware/safety.md) |
| Product liability insurance | You are the manufacturer | A broker who covers sporting goods |
| GTIN (UPC/EAN) | Needed for most marketplace listings | GS1, or a brand GTIN exemption |

None of this is legal advice. Talk to a test lab and a broker in your
market before your first sale.

## Kit or assembled?

- **Kit (electronics + printed/cut parts + instructions).** Less
  certification surface if the buyer assembles and the battery ships
  separately, but rules vary by market, so confirm with your test lab.
  Good first product.
- **Assembled and tested.** What most players want to buy. You carry the
  full compliance list above.

## One command to list it on Amazon

The `tennisbots listing` command turns one seller config file into an
Amazon listing through the **Selling Partner API on your own seller
account**. Your credentials stay in your environment. Nothing passes
through this project.

1. Register as a developer for your own Seller Central account and create
   a private SP-API app (Seller Central, "Develop apps"). Self-authorise it
   to get a refresh token.
2. Copy `seller.example.json` to `seller.json` (git-ignored) and fill it
   in.
3. Set your credentials (never commit them):

   ```
   export SPAPI_LWA_CLIENT_ID=...  SPAPI_LWA_CLIENT_SECRET=...
   export SPAPI_REFRESH_TOKEN=...  SPAPI_SELLER_ID=...
   ```

4. Find your product type and put it in `seller.json`:
   `tennisbots listing types seller.json --keywords "tennis ball machine"`
5. Build it and read the readiness report:
   `tennisbots listing build seller.json -o listing.json`.
   Anything marked BLOCKING has to be done first: the tool will not go
   live without it.
6. Dry run (default, sends nothing): `tennisbots listing submit seller.json`
7. Let Amazon validate it without creating anything:
   `tennisbots listing submit seller.json --validate`.
   Fix any issues it returns (product types need attributes beyond the
   common core this tool fills in; add them under `extra_attributes`).
8. Go live: `tennisbots listing submit seller.json --live`

Images, A+ content and Brand Registry are done in Seller Central.

Selling on Amazon also means following Amazon's own policies (product
compliance, dangerous goods for the battery, restricted products). Read
the current versions in Seller Central. They change, and this tool cannot
check them for you.
