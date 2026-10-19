"""Sell what you build: an Amazon listing from one seller config file, on the seller's own account.

    tennisbots listing build   seller.json      # listing JSON + readiness report, offline
    tennisbots listing types   seller.json      # look up Amazon's product type (live, read-only)
    tennisbots listing submit  seller.json      # dry run: print the exact request, send nothing
    tennisbots listing submit  seller.json --validate   # Amazon checks it, creates nothing
    tennisbots listing submit  seller.json --live       # create/update the listing

It talks to the Amazon Selling Partner API (Listings Items 2021-08-01) with
the seller's own Login-with-Amazon credentials, read from environment
variables. Nothing goes through this project or its authors. Live modes
refuse to run while the readiness report has blocking items, because
listing a ball launcher without the safety, radio and battery paperwork
is how a seller gets suspended, or someone gets hurt.

Amazon's attribute requirements differ by product type and marketplace,
and they change. This builds the common core attributes. `--validate`
(VALIDATION_PREVIEW) is the source of truth for what else your product
type needs. Run it before `--live`.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

ENDPOINTS = {
    "na": "https://sellingpartnerapi-na.amazon.com",
    "eu": "https://sellingpartnerapi-eu.amazon.com",
    "fe": "https://sellingpartnerapi-fe.amazon.com",
}
LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token"
ENV = ("SPAPI_LWA_CLIENT_ID", "SPAPI_LWA_CLIENT_SECRET", "SPAPI_REFRESH_TOKEN", "SPAPI_SELLER_ID")

PRODUCTS = {
    "feeder": {
        "title": "{brand} {model} Tennis Ball Machine with Moving Catch Net, Programmable Drills, Topspin and Backspin",
        "bullets": [
            "Feeds programmable drills: set each ball's target, speed and spin from a phone or laptop",
            "Two-wheel launcher for topspin, backspin and flat balls",
            "Stereo cameras track your return and the base slides sideways so the catch net is where the ball arrives",
            "Caught balls roll back into the hopper and are fed again, so you pick up fewer balls",
            "Emergency stop, wheel guards and a watchdog that stops all motors if the controller goes quiet",
        ],
        "description": ("A ball machine that feeds drills and catches your returns. Built from the open-source "
                        "Open Tennis Robots design (MIT licence): hardware drawings, firmware and planning software "
                        "are public, so it can be repaired and modified."),
    },
    "collector": {
        "title": "{brand} {model} Robotic Tennis Ball Collector, Autonomous Ball Pickup Robot for Practice Sessions",
        "bullets": [
            "Roams the court and picks up tennis balls while you practise with a ball machine or a coach",
            "Camera finds balls and plans the shortest route; a lawn-mower sweep works with no camera",
            "Keep-out zones keep it out of the player's and the coach's area",
            "Bumper skirt, emergency stop, and a watchdog that stops it if the controller goes quiet",
            "Hopper holds about 75 balls and empties at a dump point you choose",
        ],
        "description": ("A robot that collects tennis balls during practice. Built from the open-source Open Tennis "
                        "Robots design (MIT licence): hardware drawings, firmware and planning software are public, "
                        "so it can be repaired and modified."),
    },
}

# What a seller must confirm before going live. Keys are config["compliance"] fields.
COMPLIANCE = {
    "product_safety_tested": "Product safety evaluation for the finished machine (e.g. the applicable UL/IEC standard, or a test lab's report)",
    "radio_compliance": "Radio compliance for the finished product (FCC Part 15 in the US, RED/CE in the EU, UKCA in the UK)",
    "battery_un38_3": "UN 38.3 test summary for the lithium battery pack (needed to ship it; Amazon dangerous-goods review)",
    "battery_safety_data_sheet": "Safety data sheet for the battery",
    "warnings_and_manual": "Printed safety warnings and user manual in the box, in the marketplace's language",
    "product_liability_insurance": "Product liability insurance (Amazon can require it depending on your sales; get it anyway)",
}


@dataclass
class Readiness:
    blocking: list[str]
    advisory: list[str]

    @property
    def ok(self) -> bool:
        return not self.blocking


def load(path: str) -> dict:
    with open(path) as fh:
        return json.load(fh)


def readiness(cfg: dict) -> Readiness:
    blocking, advisory = [], []
    for k in ("brand", "sku", "product", "marketplace_id", "price", "quantity"):
        if cfg.get(k) in (None, ""):
            blocking.append(f"seller config is missing '{k}'")
    if cfg.get("product") not in PRODUCTS:
        blocking.append(f"'product' must be one of {sorted(PRODUCTS)}")
    if not cfg.get("product_type"):
        blocking.append("'product_type' not set: run `tennisbots listing types seller.json` and pick one")
    if not cfg.get("gtin") and not cfg.get("gtin_exempt"):
        blocking.append("no GTIN (UPC/EAN): buy one from GS1, or get a GTIN exemption for your brand and set gtin_exempt")
    comp = cfg.get("compliance", {})
    for key, what in COMPLIANCE.items():
        if comp.get(key) is not True:
            blocking.append(f"compliance not confirmed: {what} (set compliance.{key} = true once you have it)")
    if not cfg.get("images"):
        advisory.append("no images listed: Amazon needs at least a main image on white; upload them in Seller Central")
    if cfg.get("fulfillment", "merchant") == "fba":
        advisory.append("FBA with a lithium battery: expect a dangerous-goods (hazmat) review before inbound shipping")
    if not cfg.get("brand_registry"):
        advisory.append("Brand Registry not set: optional, but it protects your listing from hijacking")
    return Readiness(blocking, advisory)


def _attr(value, cfg: dict, lang: bool = True) -> list[dict]:
    a = {"value": value, "marketplace_id": cfg["marketplace_id"]}
    if lang:
        a["language_tag"] = cfg.get("language_tag", "en_US")
    return [a]


def build(cfg: dict) -> dict:
    """Listings Items API body (requirements=LISTING) with the common core attributes."""
    p = PRODUCTS[cfg["product"]]
    brand = cfg["brand"]
    model = cfg.get("model", "")
    title = " ".join(p["title"].format(brand=brand, model=model).split())
    mp = cfg["marketplace_id"]
    attrs = {
        "item_name": _attr(cfg.get("title", title), cfg),
        "brand": _attr(brand, cfg),
        "manufacturer": _attr(cfg.get("manufacturer", brand), cfg),
        "bullet_point": [{"value": b, "language_tag": cfg.get("language_tag", "en_US"), "marketplace_id": mp}
                         for b in cfg.get("bullets", p["bullets"])],
        "product_description": _attr(cfg.get("description", p["description"]), cfg),
        "condition_type": [{"value": cfg.get("condition", "new_new"), "marketplace_id": mp}],
        "batteries_required": [{"value": True, "marketplace_id": mp}],
        "batteries_included": [{"value": True, "marketplace_id": mp}],
        "purchasable_offer": [{
            "currency": cfg.get("currency", "USD"),
            "our_price": [{"schedule": [{"value_with_tax": cfg["price"]}]}],
            "marketplace_id": mp,
        }],
        "fulfillment_availability": [{
            "fulfillment_channel_code": "AMAZON_NA" if cfg.get("fulfillment") == "fba" else "DEFAULT",
            **({} if cfg.get("fulfillment") == "fba" else {"quantity": cfg["quantity"]}),
        }],
    }
    if model:
        attrs["model_number"] = _attr(model, cfg, lang=False)
    if cfg.get("gtin"):
        attrs["externally_assigned_product_identifier"] = [
            {"type": cfg.get("gtin_type", "upc"), "value": cfg["gtin"], "marketplace_id": mp}]
    if cfg.get("gtin_exempt"):
        attrs["supplier_declared_has_product_identifier_exemption"] = [{"value": True, "marketplace_id": mp}]
    if cfg.get("country_of_origin"):
        attrs["country_of_origin"] = [{"value": cfg["country_of_origin"], "marketplace_id": mp}]
    attrs.update(cfg.get("extra_attributes", {}))
    return {"productType": cfg.get("product_type") or "UNRESOLVED", "requirements": "LISTING", "attributes": attrs}


def credentials(env=os.environ) -> dict:
    missing = [k for k in ENV if not env.get(k)]
    if missing:
        raise RuntimeError("missing seller credentials in the environment: " + ", ".join(missing))
    return {k: env[k] for k in ENV}


def put_request(cfg: dict, body: dict, seller_id: str, *, validate: bool) -> dict:
    """The putListingsItem request as data (method, url, headers minus the token, JSON body)."""
    base = ENDPOINTS[cfg.get("region", "na")]
    q = {"marketplaceIds": cfg["marketplace_id"]}
    if validate:
        q["mode"] = "VALIDATION_PREVIEW"
    url = (f"{base}/listings/2021-08-01/items/{urllib.parse.quote(seller_id)}/"
           f"{urllib.parse.quote(cfg['sku'], safe='')}?{urllib.parse.urlencode(q)}")
    return {"method": "PUT", "url": url, "headers": {"content-type": "application/json"}, "body": body}


def types_request(cfg: dict, keywords: str) -> dict:
    base = ENDPOINTS[cfg.get("region", "na")]
    q = urllib.parse.urlencode({"keywords": keywords, "marketplaceIds": cfg["marketplace_id"]})
    return {"method": "GET", "url": f"{base}/definitions/2020-09-01/productTypes?{q}", "headers": {}, "body": None}


def access_token(creds: dict, opener=urllib.request.urlopen) -> str:
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": creds["SPAPI_REFRESH_TOKEN"],
        "client_id": creds["SPAPI_LWA_CLIENT_ID"],
        "client_secret": creds["SPAPI_LWA_CLIENT_SECRET"],
    }).encode()
    req = urllib.request.Request(LWA_TOKEN_URL, data=data, method="POST",
                                 headers={"content-type": "application/x-www-form-urlencoded"})
    with opener(req, timeout=30) as resp:
        return json.load(resp)["access_token"]


def send(request: dict, token: str, opener=urllib.request.urlopen) -> dict:
    data = json.dumps(request["body"]).encode() if request["body"] is not None else None
    headers = dict(request["headers"], **{"x-amz-access-token": token, "user-agent": "tennisbots-listing/0.1"})
    req = urllib.request.Request(request["url"], data=data, method=request["method"], headers=headers)
    try:
        with opener(req, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        return {"http_status": exc.code, "error": exc.read().decode("utf-8", "replace")}
