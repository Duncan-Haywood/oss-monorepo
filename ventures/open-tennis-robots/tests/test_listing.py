import io
import json
import os
import unittest
import urllib.parse

from tennisbots import listing

EXAMPLE = os.path.join(os.path.dirname(__file__), "..", "sell", "seller.example.json")


def ready_config():
    cfg = listing.load(EXAMPLE)
    cfg.update(product_type="EXAMPLE_TYPE", gtin="012345678905", images=["main.jpg"], brand_registry=True)
    cfg["compliance"] = {k: True for k in listing.COMPLIANCE}
    return cfg


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class ListingTest(unittest.TestCase):
    def test_example_is_blocked_until_compliance_confirmed(self):
        r = listing.readiness(listing.load(EXAMPLE))
        self.assertFalse(r.ok)
        self.assertTrue(any("UN 38.3" in b for b in r.blocking))
        self.assertTrue(listing.readiness(ready_config()).ok)

    def test_build_core_attributes(self):
        for product in listing.PRODUCTS:
            cfg = dict(ready_config(), product=product)
            body = listing.build(cfg)
            a = body["attributes"]
            self.assertEqual(body["productType"], "EXAMPLE_TYPE")
            self.assertEqual(body["requirements"], "LISTING")
            self.assertIn("YourBrand", a["item_name"][0]["value"])
            self.assertLessEqual(len(a["item_name"][0]["value"]), 200)
            self.assertEqual(a["externally_assigned_product_identifier"][0]["value"], "012345678905")
            self.assertEqual(a["purchasable_offer"][0]["our_price"][0]["schedule"][0]["value_with_tax"], 1499.0)
            self.assertEqual(len(a["bullet_point"]), 5)
            for values in a.values():
                for v in values:
                    if "marketplace_id" in v:
                        self.assertEqual(v["marketplace_id"], "ATVPDKIKX0DER")

    def test_put_request_shape(self):
        cfg = ready_config()
        req = listing.put_request(cfg, listing.build(cfg), "A1SELLER", validate=True)
        u = urllib.parse.urlparse(req["url"])
        self.assertEqual(u.netloc, "sellingpartnerapi-na.amazon.com")
        self.assertEqual(u.path, "/listings/2021-08-01/items/A1SELLER/OTR-F1-US-001")
        q = urllib.parse.parse_qs(u.query)
        self.assertEqual(q["mode"], ["VALIDATION_PREVIEW"])
        live = listing.put_request(cfg, {}, "A1SELLER", validate=False)
        self.assertNotIn("mode=", live["url"])

    def test_credentials_required(self):
        with self.assertRaises(RuntimeError):
            listing.credentials({})
        env = {k: "x" for k in listing.ENV}
        self.assertEqual(listing.credentials(env)["SPAPI_SELLER_ID"], "x")

    def test_token_and_send_with_fake_http(self):
        seen = []

        def opener(req, timeout):
            seen.append(req)
            if req.full_url == listing.LWA_TOKEN_URL:
                return FakeResponse(json.dumps({"access_token": "Atza|t"}).encode())
            return FakeResponse(json.dumps({"status": "VALID", "issues": []}).encode())

        creds = {k: "v" for k in listing.ENV}
        token = listing.access_token(creds, opener)
        self.assertEqual(token, "Atza|t")
        self.assertIn(b"grant_type=refresh_token", seen[0].data)
        cfg = ready_config()
        out = listing.send(listing.put_request(cfg, listing.build(cfg), "S", validate=True), token, opener)
        self.assertEqual(out["status"], "VALID")
        self.assertEqual(seen[1].get_method(), "PUT")
        self.assertEqual(seen[1].get_header("X-amz-access-token"), "Atza|t")


if __name__ == "__main__":
    unittest.main()
