"""The price re-check reads the right number off each kind of page."""

import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("recheck_prices", Path(__file__).with_name("recheck_prices.py"))
rp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rp)


def test_offer_price_from_json_ld_graph_and_list():
    assert rp.offer_price('<script type="application/ld+json">{"@graph":[{"@type":"Product","offers":{"price":"615"}}]}</script>') == 615.0
    assert rp.offer_price('<script type="application/ld+json">[{"@type":"Product","offers":[{"lowPrice":"7.10"}]}]</script>') == 7.1
    assert rp.offer_price("<p>no data</p>") is None


def test_shopify_takes_the_cheapest_variant():
    body = '{"product":{"variants":[{"price":"65.50"},{"price":"62.00"}]}}'
    assert rp.shopify_price(body) == 62.0
    assert rp.shopify_price("not json") is None


def test_only_allowlisted_sellers_are_fetched():
    for url in [
        "https://www.homedepot.com/p/312528776",
        "https://www.lowes.com/pd/x/1",
        "https://www.menards.com/main/building-materials/x/p-1.htm",
        "https://example.com/shedwindowsandmore.com/products/x",
    ]:
        assert rp.read_now(url) == ("not read", None), url
